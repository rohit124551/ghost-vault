require('dotenv').config();
const supabase = require('./lib/supabase');

async function check() {
  console.log('Checking Supabase connection...');
  try {
    const { data, error } = await supabase.from('rooms').select('count', { count: 'exact', head: true });
    console.log('Rooms count check:', { data, error });

    console.log('Checking if bugs table exists...');
    const { data: bugData, error: bugError } = await supabase.from('bugs').select('*').limit(1);
    console.log('Bugs check:', { bugData, bugError });
  } catch (err) {
    console.error('Error in check:', err);
  }
}

check();
