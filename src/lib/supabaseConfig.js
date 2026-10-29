import { createClient } from '@supabase/supabase-js';

// Coloque aqui a sua URL real e a sua Anon Key do Supabase!
export const SUPABASE_URL = 'https://jjdrudvqkfqbvayhyfrh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqZHJ1ZHZxa2ZxYnZheWh5ZnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTc1ODUsImV4cCI6MjA5OTY3MzU4NX0.BdlfX0agaktuPDMiiIQDSh3pdIZhjNcU1BKr4-hstyI'; // Substitua pela sua chave gigante

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = true;