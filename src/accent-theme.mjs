export const DEFAULT_ACCENT='#bca9f0';
export const validAccent=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=values=>'#'+values.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
const mix=(a,b,amount)=>a.map((n,i)=>n+(b[i]-n)*amount);
const luminance=values=>values.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>{const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const foreground=background=>contrast(background,'#11131d')>=4.5?'#11131d':contrast(background,'#ffffff')>=4.5?'#ffffff':'#000000';

// All custom surfaces share these tokens. Keep the chosen fill exact, but
// lighten accent text on dark surfaces and choose a readable button label.
export function accentTheme(value){
  const accent=validAccent(value)?value.toLowerCase():DEFAULT_ACCENT,base=rgb(accent);
  let text=accent;
  for(let step=1;contrast(text,'#202735')<4.5&&step<=100;step++)text=hex(mix(base,[255,255,255],step/100));
  const hover=hex(mix(base,[255,255,255],.12));
  const theme={
    '--pme-accent':accent,'--pme-accent-text':text,
    '--pme-accent-muted':hex(mix(rgb(text),rgb('#94a2b8'),.3)),
    '--pme-accent-contrast':foreground(accent),
    '--pme-accent-hover':hover,'--pme-accent-hover-contrast':foreground(hover),
    '--pme-accent-rgb':rgb(text).join(','),
    '--pme-accent-hover-rgb':rgb(hex(mix(rgb(text),[255,255,255],.12))).join(','),
    '--pme-accent-surface':hex(mix(rgb('#18171c'),base,.12)),
    '--pme-accent-surface-hover':hex(mix(rgb('#18171c'),base,.2)),
  };
  for(const alpha of ['16','17','1a','20','22','29','2b','33','35','40','44','66','99'])theme[`--pme-accent-a${alpha}`]=text+alpha;
  return theme;
}
