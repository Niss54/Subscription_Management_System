from decimal import Decimal
from datetime import date
from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models import DiscountRule, DiscountType, DiscountScope, SubscriptionDiscount, SubscriptionLine, ProductVariant

def get_valid_subscription_discounts(db: Session, subscription_id: str, run_date: date) -> List[DiscountRule]:
    """
    Retrieves all currently active, unexpired, and capacity-available discount rules
    attached to a given subscription.
    """
    sub_discounts = (
        db.query(SubscriptionDiscount)
        .filter(SubscriptionDiscount.subscription_id == subscription_id)
        .all()
    )
    valid_rules = []
    for sd in sub_discounts:
        rule = sd.discount_rule
        if not rule.is_active:
            continue
        if rule.start_date and run_date < rule.start_date:
            continue
        if rule.end_date and run_date > rule.end_date:
            continue
        if rule.max_uses is not None and rule.current_uses >= rule.max_uses:
            continue
        valid_rules.append(rule)
    return valid_rules

def calculate_discounts_and_taxes(
    db: Session,
    lines: List[SubscriptionLine],
    discounts: List[DiscountRule]
) -> Tuple[Decimal, Decimal, Decimal, Decimal, List[dict]]:
    """
    Calculates untaxed amount, discount amount, taxes, and final total
    using the proportional discount apportionment formula across multi-rate items.
    
    Returns:
        (total_untaxed, total_discount, total_tax, total_amount, line_breakdowns)
    """
    total_untaxed = Decimal("0.0000")
    line_details = []

    # 1. Compute gross line subtotals
    for line in lines:
        qty = Decimal(str(line.quantity))
        price = Decimal(str(line.unit_price))
        subtotal = qty * price
        total_untaxed += subtotal
        line_details.append({
            "line": line,
            "quantity": qty,
            "unit_price": price,
            "gross_subtotal": subtotal,
            "tax_rate": Decimal(str(line.tax_rate or Decimal("0.00"))),
            "discount_allocated": Decimal("0.0000"),
            "taxable_base": Decimal("0.0000"),
            "tax_amount": Decimal("0.0000"),
            "line_total": Decimal("0.0000")
        })

    total_discount = Decimal("0.0000")

    # 2. Evaluate and apply discounts
    for rule in discounts:
        # Check purchase threshold
        if rule.min_purchase_amount and total_untaxed < Decimal(str(rule.min_purchase_amount)):
            continue
        
        # Check total quantity threshold
        total_qty = sum(item["quantity"] for item in line_details)
        if rule.min_quantity and total_qty < rule.min_quantity:
            continue

        if rule.scope == DiscountScope.product and rule.target_product_id:
            # Line-specific discount
            for item in line_details:
                variant: ProductVariant = item["line"].variant
                if variant and variant.product_id == rule.target_product_id:
                    if rule.discount_type == DiscountType.percentage:
                        disc = item["gross_subtotal"] * (Decimal(str(rule.discount_value)) / Decimal("100.00"))
                    else:
                        disc = min(item["gross_subtotal"], Decimal(str(rule.discount_value)))
                    item["discount_allocated"] += disc
                    total_discount += disc

        elif rule.scope == DiscountScope.subscription:
            # Whole-subscription discount (Proportional distribution)
            if rule.discount_type == DiscountType.percentage:
                disc_rate = Decimal(str(rule.discount_value)) / Decimal("100.00")
                for item in line_details:
                    disc = item["gross_subtotal"] * disc_rate
                    item["discount_allocated"] += disc
                    total_discount += disc
            else:
                fixed_disc = min(total_untaxed, Decimal(str(rule.discount_value)))
                total_discount += fixed_disc
                if total_untaxed > 0:
                    for item in line_details:
                        proportion = item["gross_subtotal"] / total_untaxed
                        disc = (fixed_disc * proportion).quantize(Decimal("0.0001"))
                        item["discount_allocated"] += disc

    # 3. Calculate taxes strictly on net taxable base
    total_tax = Decimal("0.0000")
    total_amount = Decimal("0.0000")

    for item in line_details:
        taxable_base = max(Decimal("0.0000"), item["gross_subtotal"] - item["discount_allocated"])
        tax_amount = (taxable_base * (item["tax_rate"] / Decimal("100.00"))).quantize(Decimal("0.0001"))
        line_total = taxable_base + tax_amount

        item["taxable_base"] = taxable_base
        item["tax_amount"] = tax_amount
        item["line_total"] = line_total

        total_tax += tax_amount
        total_amount += line_total

    return total_untaxed, total_discount, total_tax, total_amount, line_details

def record_discount_usage_atomic(db: Session, discount_rule_id: str) -> bool:
    """
    Atomically increments current_uses on a discount rule if capacity remains.
    Returns True if successfully incremented, False if exhausted.
    """
    rule = db.query(DiscountRule).filter(DiscountRule.id == discount_rule_id).first()
    if not rule or not rule.is_active:
        return False
    if rule.max_uses is not None and rule.current_uses >= rule.max_uses:
        return False
    rule.current_uses += 1
    db.commit()
    return True

