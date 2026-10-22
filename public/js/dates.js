// Date helpers shared by the browser and the server, so both agree on what
// "today" means. Dates are plain 'YYYY-MM-DD' strings in local time.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → a Date at local midnight. (new Date('2026-10-20') would
// mean midnight UTC, which is the wrong day in some time zones.)
function parse(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function localDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function today() {
  return localDate(new Date());
}

export function addDays(dateString, days) {
  const date = parse(dateString);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

// '2026-10-20' → 'Tue 20 Oct'
export function formatShort(dateString) {
  const date = parse(dateString);
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
