"""
Proration Engine (Adapted from AkibUllah/saas-subscription-billing).
Calculates exact unused period credits and charges using fractions
to guarantee zero round-off disagreement.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from fractions import Fraction


def remaining_fraction(period_start: datetime, period_end: datetime, at: datetime) -> Fraction:
    """Fraction of the period that lies after `at`, clamped to [0, 1]."""
    total = int((period_end - period_start).total_seconds())
    if total <= 0:
        raise ValueError("period_end must be after period_start")
    remaining = int((period_end - at).total_seconds())
    remaining = max(0, min(total, remaining))
    return Fraction(remaining, total)


def scale_amount(amount: Decimal, fraction: Fraction) -> Decimal:
    """Scales a decimal amount by an exact fraction and rounds to 4 decimal places."""
    scaled = (amount * Decimal(fraction.numerator)) / Decimal(fraction.denominator)
    return round(scaled, 4)


@dataclass(frozen=True)
class ProrationResult:
    """Result of switching from one recurring price or plan to another mid-period."""
    credit_amount: Decimal    # Unused portion of current plan already paid
    charge_amount: Decimal    # Remaining portion of new plan to be paid
    fraction: Fraction

    @property
    def net_amount(self) -> Decimal:
        """Net due: positive means customer pays difference; negative means customer gets credit."""
        return self.charge_amount - self.credit_amount


def calculate_proration(
    old_amount: Decimal,
    new_amount: Decimal,
    period_start: datetime,
    period_end: datetime,
    at: datetime
) -> ProrationResult:
    frac = remaining_fraction(period_start, period_end, at)
    credit = scale_amount(old_amount, frac)
    charge = scale_amount(new_amount, frac)
    return ProrationResult(
        credit_amount=credit,
        charge_amount=charge,
        fraction=frac
    )
