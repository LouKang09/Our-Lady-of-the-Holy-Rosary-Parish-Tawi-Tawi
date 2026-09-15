export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function fail(message,status=400){throw new HttpError(status,message);}
import { copyFields } from './copy-schema.js';
export const kinds=['post','event','schedule','collection','person'];
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function text(value,name,max=300,required=false){if(typeof value!=='string') {if(value==null&&!required)return '';fail(`${name} must be text.`);}const s=value.trim();if((required&&!s)||s.length>max)fail(`${name} ${!s?'is required.':`must be ${max} characters or fewer.`}`);return s;}
export function isoDate(value,name='Date'){const s=text(value,name,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail(`${name} is not a valid date.`);return s;}
export function time(value,name){const s=text(value,name,5,true);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))fail(`${name} must be a valid time.`);return s;}
export function dateTime(value,name){const s=text(value,name,35,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))fail(`${name} must include a valid date, time, and timezone.`);isoDate(s.slice(0,10),name);return new Date(s).toISOString();}
export function cents(value){const s=typeof value==='number'?String(value):value;if(typeof s!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(s))fail('Enter a non-negative amount with at most two decimal places.');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export function imageIds(value,max=8){if(!Array.isArray(value)||value.length>max||value.some(x=>typeof x!=='string'||!/^m_[a-z0-9-]{36}$/.test(x))||new Set(value).size!==value.length)fail(`Select up to ${max} different photos.`);return value;}
export function validateContent(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid content.');
 const kind=input.kind;if(!kinds.includes(kind))fail('Choose a valid content type.');
 const status=input.status;if(!['draft','published'].includes(status))fail('Choose Draft or Published.');
 const title=text(input.title,'Title',160,true),body=text(input.body,'Description',30000,kind==='post'&&status==='published');
 const images=imageIds(input.images??[],kind==='post'?8:kind==='event'?4:kind==='person'?1:0);
 const d=input.data??{};if(typeof d!=='object'||Array.isArray(d))fail('Invalid details.');
 let data={},eventStart=null,reportDate=null,amountCents=null;
 if(kind==='post'){data={excerpt:text(d.excerpt,'Excerpt',360),author:text(d.author,'Author display name',100)};}
 if(kind==='person'){
  if(!['priest','ppc','choir','staff'].includes(d.group))fail('Choose a parish group.');
  if(!Array.isArray(d.terms)||!d.terms.length||d.terms.length>30)fail('Add at least one service period, up to 30.');
  const year=(v,label)=>{if(v===''||v==null)return null;const n=Number(v);if(!Number.isInteger(n)||n<1500||n>2200)fail(`${label} must be a year between 1500 and 2200.`);return n;};
  const terms=d.terms.map(term=>{const startYear=year(term.startYear,'Start year'),endYear=year(term.endYear,'End year');if(typeof term.current!=='boolean')fail('Choose current or former for every service period.');if(term.current&&endYear)fail('Current service periods cannot have an end year.');if(startYear&&endYear&&endYear<startYear)fail('A service period cannot end before it starts.');return {role:text(term.role,'Role',140,true),startYear,endYear,current:term.current,notes:text(term.notes,'Service notes',1000)};});
  data={group:d.group,role:text(d.role,'Profile role',140,true),terms};
 }
 if(kind==='event'){
  data={start:dateTime(d.start,'Start'),end:dateTime(d.end,'End'),location:text(d.location,'Location',240,true)};
  if(data.end<data.start)fail('The event end must be after its start.');eventStart=data.start;
 }
 if(kind==='schedule'){
  if(!['Mass','Confession','Rosary','Adoration','Other'].includes(d.category))fail('Choose a schedule category.');
  if(!['weekly','once'].includes(d.recurrence))fail('Choose a recurring or one-time schedule.');
  data={category:d.category,recurrence:d.recurrence,startTime:time(d.startTime,'Start time'),endTime:d.endTime?time(d.endTime,'End time'):'',location:text(d.location,'Location',200),language:text(d.language,'Language',60)};
  if(data.endTime&&data.endTime<=data.startTime)fail('End time must be after start time.');
  if(d.recurrence==='weekly'){if(!Array.isArray(d.days)||!d.days.length||d.days.some(x=>!Number.isInteger(x)||x<0||x>6))fail('Select at least one day.');data.days=[...new Set(d.days)].sort();data.validFrom=d.validFrom?isoDate(d.validFrom,'Valid from'):'';data.validUntil=d.validUntil?isoDate(d.validUntil,'Valid until'):'';if(data.validFrom&&data.validUntil&&data.validUntil<data.validFrom)fail('The end date must follow the start date.');}
  else data.date=isoDate(d.date,'Schedule date');
 }
 if(kind==='collection'){
  reportDate=isoDate(d.date,'Collection date');if(new Date(reportDate+'T12:00:00Z').getUTCDay()!==0)fail('Choose a Sunday for this collection report.');
  if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>20)fail('Add between 1 and 20 collection entries.');
  const lines=d.lines.map(x=>({label:text(x.label,'Collection label',100,true),amountCents:cents(x.amount)}));
  amountCents=lines.reduce((sum,line)=>sum+line.amountCents,0);if(amountCents>9999999999)fail('The report total is too large.');
  data={date:reportDate,lines,currency:'PHP',note:text(d.note,'Public note',2000)};
 }
 return {kind,title,body,status,images,data,eventStart,reportDate,amountCents};
}
export const defaultSettings={heroImage:'',aboutImage:'',officeHours:'',phone:'',email:'',address:'Bongao, Tawi-Tawi, Philippines',welcome:'',version:0,parishName:'Our Lady of the Holy Rosary Parish',heroImages:[],heroPosition:'center',heroAlignment:'center',heroOverlay:55,heroInterval:7,heroAutoplay:true,copy:{},sectionVisibility:{},facebook:'',mapUrl:''};
export function validateExpandedSettings(input){
 const out={parishName:text(input.parishName??defaultSettings.parishName,'Parish name',180,true),heroImages:imageIds(input.heroImages??[],8),heroPosition:input.heroPosition??'center',heroAlignment:input.heroAlignment??'center',heroOverlay:Number(input.heroOverlay??55),heroInterval:Number(input.heroInterval??7),heroAutoplay:input.heroAutoplay??true,copy:{},sectionVisibility:{},facebook:text(input.facebook,'Facebook link',500),mapUrl:text(input.mapUrl,'Map link',1000)};
 if(!['center','top','bottom','left','right'].includes(out.heroPosition))fail('Choose a photo position.');if(!['center','left'].includes(out.heroAlignment))fail('Choose a text alignment.');
 if(!Number.isFinite(out.heroOverlay)||out.heroOverlay<25||out.heroOverlay>85)fail('Background shade must be between 25 and 85.');if(!Number.isFinite(out.heroInterval)||out.heroInterval<4||out.heroInterval>30)fail('Slide duration must be 4 to 30 seconds.');if(typeof out.heroAutoplay!=='boolean')fail('Choose whether the slideshow plays automatically.');
 for(const key of ['facebook','mapUrl'])if(out[key]){try{const u=new URL(out[key]);if(u.protocol!=='https:'||u.username||u.password)fail('Use a complete HTTPS link.');}catch{fail('Use a complete HTTPS link.');}}
 const copy=input.copy??{};if(typeof copy!=='object'||Array.isArray(copy))fail('Invalid page text.');for(const field of copyFields)if(Object.hasOwn(copy,field.key))out.copy[field.key]=text(copy[field.key],field.label,field.max);
 for(const key of ['about','masses','sacraments','quote','updates','events','collections','people','visit']){const value=input.sectionVisibility?.[key];if(value!==undefined&&typeof value!=='boolean')fail('Invalid section visibility.');out.sectionVisibility[key]=value??true;}
 return out;
}
export function validateSettings(input){let s={};for(const key of ['heroImage','aboutImage']){s[key]=input[key]||'';if(s[key])imageIds([s[key]],1);}s.officeHours=text(input.officeHours,'Office hours',600);s.phone=text(input.phone,'Phone',60);if(s.phone&&!/^[+\d\s()/-]+$/.test(s.phone))fail('Enter a valid phone number.');s.email=text(input.email,'Email',160);if(s.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))fail('Enter a valid email address.');s.address=text(input.address,'Address',400,true);s.welcome=text(input.welcome,'Welcome message',800);return {...s,...validateExpandedSettings(input)};}
export function decodeRow(r){return {...r,data:JSON.parse(r.data),images:JSON.parse(r.images)};}
export function publicRow(r){return {id:r.id,kind:r.kind,title:r.title,body:r.body,data:JSON.parse(r.data),images:JSON.parse(r.images),amountCents:r.amount_cents,updatedAt:r.updated_at,createdAt:r.created_at};}
export function imageMime(bytes){if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';if(bytes.length>=16&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';return null;}
