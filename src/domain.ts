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
export const GRAMS_PER_OUNCE = 28.349523125;
export type WeightUnit = 'oz' | 'lb';
function storedGrams(grams: number) {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 100000) throw new Error('Enter a positive weight within the supported range.');
  const rounded = Math.round(grams * 1000) / 1000;
  if (rounded <= 0) throw new Error('Enter a weight greater than zero.');
  return rounded;
}
export function weightToGrams(ounces: string, pounds?: string) {
  const oz = ounces.trim();
  const lb = pounds?.trim();
  if (!oz && !lb) throw new Error('Enter a weight greater than zero.');
  if (oz && !/^\d+(?:\.\d{1,2})?$/.test(oz)) throw new Error('Enter ounces with up to two decimal places, such as 14.34.');
  if (lb && !/^\d+$/.test(lb)) throw new Error('Enter whole pounds; use the ounces field for the remaining weight.');
  if (pounds !== undefined && Number(oz) >= 16) throw new Error('Remaining ounces must be less than 16. Add another pound or use ounces only.');
  return storedGrams(((Number(lb || 0) * 16) + Number(oz || 0)) * GRAMS_PER_OUNCE);
}
function ounceParts(grams: number) {
  // Round once before splitting so 15.999 oz never becomes “0 lb 16 oz”.
  const hundredths = Math.round(Math.abs(grams) / GRAMS_PER_OUNCE * 100);
  return {hundredths,pounds:Math.floor(hundredths / 1600),ounces:(hundredths % 1600) / 100};
}
export function displayWeight(grams: number) {
  const {hundredths,pounds,ounces} = ounceParts(grams);
  const sign = grams < 0 && hundredths > 0 ? '-' : '';
  return pounds ? `${sign}${pounds} lb ${ounces} oz` : `${sign}${ounces} oz`;
}
export function weightInput(grams: number, unit: WeightUnit) {
  const {hundredths,pounds,ounces} = ounceParts(grams);
  return {pounds:unit==='lb'?String(pounds):'',ounces:(unit==='lb'?ounces:hundredths/100).toFixed(2)};
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
  const validated={...weight,grams:storedGrams(weight.grams)};
  if (records.weights.some(w=>w.id!==editingId && w.puppyId===weight.puppyId && w.date===weight.date)) throw new Error('This puppy already has a weight for that date.');
  return validated;
}
export function replaceRecord<T extends {id:string}>(items: T[], replacement: T): T[] {
  if (!items.some(item=>item.id===replacement.id)) throw new Error('Record no longer exists. Refresh and try again.');
  return items.map(item=>item.id===replacement.id ? replacement : item);
}
