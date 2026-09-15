const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu(){ menuButton.setAttribute('aria-expanded','false'); navigation.classList.remove('open'); }
menuButton.addEventListener('click',()=>{ const open=menuButton.getAttribute('aria-expanded')!=='true'; menuButton.setAttribute('aria-expanded',String(open)); navigation.classList.toggle('open',open); });
navigation.addEventListener('click',event=>{if(event.target.closest('a')) closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && navigation.classList.contains('open')){closeMenu();menuButton.focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('.header'))closeMenu();});
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
if('IntersectionObserver' in window && !reducedMotion.matches){
 const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}});},{threshold:.08});
 document.querySelectorAll('.reveal').forEach(element=>{element.classList.add('will-reveal');observer.observe(element);});
}
if('IntersectionObserver' in window){const sections=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){navigation.querySelectorAll('a').forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+entry.target.id));}});},{rootMargin:'-15% 0px -55% 0px'});document.querySelectorAll('main section[id]').forEach(section=>sections.observe(section));}
document.getElementById('year').textContent=String(new Date().getFullYear());
