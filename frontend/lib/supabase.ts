import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gluhwnvotjmkgoajrope.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWh3bnZvdGpta2dvYWpyb3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MzY5MTIsImV4cCI6MjEwOTAxMjkxMn0.be73BLMTgqsOOBmPJxPozX4tVPu_cn1u0Cptq9_NCIs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
