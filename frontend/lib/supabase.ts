import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vzuxwfmpxgkjcjdftuqp.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dXh3Zm1weGdramNqZGZ0dXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MzQ5MDksImV4cCI6MjEwOTAxMDkwOX0.SlYws7vkZK3lD7lUuFDIJ9fzginqePk14icuwVuyy5A';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
