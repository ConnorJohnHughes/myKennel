export type Litter = { id: string; name: string; mother: string; father: string; born: string };
export type Puppy = { id: string; litterId: string; name: string };
export type Weight = { id: string; puppyId: string; date: string; grams: number };
export type Records = { litters: Litter[]; puppies: Puppy[]; weights: Weight[] };
export const emptyRecords: Records = { litters: [], puppies: [], weights: [] };
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function checkDate(date: string, born?: string) {
  if (!validDate(date)) throw new Error('Enter a valid date as YYYY-MM-DD.');
  if (date > today()) throw new Error('The date cannot be in the future.');
  if (born && date < born) throw new Error('A weigh-in cannot be before the litter’s birth date.');
}
export function toGrams(value: string, unit: 'g' | 'oz') {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new Error('Enter a positive weight, such as 325 or 11.5.');
  const n = Number(value) * (unit === 'oz' ? 28.349523125 : 1);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw new Error('Weight must be above zero and at most 100,000 grams.');
  const rounded = Math.round(n * 1000) / 1000;
  if (rounded <= 0) throw new Error('Weight must be at least 0.001 grams.');
  return rounded;
}
export function displayWeight(grams: number, unit: 'g' | 'oz') {
  return `${Number((grams / (unit === 'oz' ? 28.349523125 : 1)).toFixed(2))} ${unit}`;
}
export function history(records: Records, puppyId: string) {
  return records.weights.filter(w => w.puppyId === puppyId).sort((a,b) => b.date.localeCompare(a.date));
}
export function required(value: string, label: string) {
  const text = value.trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > 100) throw new Error(`${label} must be 100 characters or fewer.`);
  return text;
}

export function validateLitter(records: Records, input: Omit<Litter,'id'>, editingId?: string) {
  const litter = {name:required(input.name,'Litter name'),mother:required(input.mother,'Mother'),father:required(input.father,'Father'),born:input.born};
  checkDate(litter.born);
  const ids = new Set(records.puppies.filter(p=>p.litterId===editingId).map(p=>p.id));
  if (editingId && records.weights.some(w=>ids.has(w.puppyId) && w.date<litter.born)) {
    throw new Error('Birth date cannot be after an existing weigh-in. Correct the weigh-in first.');
  }
  return litter;
}
export function validatePuppy(records: Records, input: Omit<Puppy,'id'>, editingId?: string) {
  const puppy = {...input,name:required(input.name,'Puppy name or identifier')};
  if (!records.litters.some(l=>l.id===puppy.litterId)) throw new Error('Litter no longer exists. Refresh and try again.');
  if (records.puppies.some(p=>p.id!==editingId && p.litterId===puppy.litterId && p.name.trim().toLowerCase()===puppy.name.toLowerCase())) throw new Error('That identifier is already used in this litter.');
  return puppy;
}
export function validateWeight(records: Records, weight: Omit<Weight,'id'>, editingId?: string) {
  const puppy=records.puppies.find(p=>p.id===weight.puppyId);
  const litter=records.litters.find(l=>l.id===puppy?.litterId);
  if (!litter) throw new Error('Puppy or litter no longer exists. Refresh and try again.');
  checkDate(weight.date,litter.born);
  const validated={...weight,grams:toGrams(String(weight.grams),'g')};
  if (records.weights.some(w=>w.id!==editingId && w.puppyId===weight.puppyId && w.date===weight.date)) throw new Error('This puppy already has a weight for that date.');
  return validated;
}
export function replaceRecord<T extends {id:string}>(items: T[], replacement: T): T[] {
  if (!items.some(item=>item.id===replacement.id)) throw new Error('Record no longer exists. Refresh and try again.');
  return items.map(item=>item.id===replacement.id ? replacement : item);
}
