// Date helpers shared by the browser and the server, so both agree on what
// "today" and "this week" mean. Dates are plain 'YYYY-MM-DD' strings in
// local time; weeks run Monday to Sunday.

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

// The suggested next due date for a chore that repeats this often.
export function addFrequency(dateString, frequency) {
  if (frequency === 'daily') return addDays(dateString, 1);
  if (frequency === 'weekly') return addDays(dateString, 7);
  if (frequency === 'monthly') {
    const date = parse(dateString);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    // 31 Jan + 1 month → 28 Feb, not 3 Mar.
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return localDate(date);
  }
  return today(); // 'once'
}

export function startOfWeek(dateString) {
  const date = parse(dateString);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(dateString, -daysSinceMonday);
}

// '2026-10-20' → 'Tue 20 Oct'
export function formatShort(dateString) {
  const date = parse(dateString);
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// Monday '2026-10-19' → '19–25 Oct'; across months → '26 Oct – 1 Nov'
export function weekLabel(mondayString) {
  const start = parse(mondayString);
  const end = parse(addDays(mondayString, 6));
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}
