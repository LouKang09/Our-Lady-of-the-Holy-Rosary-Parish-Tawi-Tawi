from html.parser import HTMLParser
from html import escape, unescape
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
class Node:
 def __init__(self,tag='',attrs=None,parent=None,data=''):self.tag=tag;self.attrs=dict(attrs or []);self.parent=parent;self.children=[];self.data=data
 def text(self):return ('\n' if self.tag=='br' else unescape(self.data)) + ''.join(c.text() for c in self.children)
 def output(self):
  if not self.tag:return self.data
  if self.tag=='root':return ''.join(c.output() for c in self.children)
  a=''.join(' '+k+('="'+escape(v,quote=True)+'"' if v is not None else '') for k,v in self.attrs.items())
  start='<'+self.tag+a+'>'
  return start if self.tag in ['meta','link','br','img','input','hr','source','wbr'] else start+''.join(c.output() for c in self.children)+'</'+self.tag+'>'
class Parser(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=False);self.root=Node('root');self.current=self.root
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs,self.current);self.current.children.append(n)
  if tag not in ['meta','link','br','img','input','hr','source','wbr']:self.current=n
 def handle_endtag(self,tag):
  p=self.current
  while p.parent:
   if p.tag==tag:self.current=p.parent;return
   p=p.parent
 def handle_data(self,data):self.current.children.append(Node(data=data))
 def handle_entityref(self,name):self.handle_data('&'+name+';')
 def handle_charref(self,name):self.handle_data('&#'+name+';')
 def handle_decl(self,decl):self.handle_data('<!'+decl+'>')
parser=Parser();parser.feed((root/'public/index.html').read_text());fields=[]
def visit(n,group='Homepage',locked=False):
 if n.tag=='section':group={'home':'Welcome banner','about':'About the parish','masses':'Mass & prayer','sacraments':'Sacraments','updates':'Parish stories','visit':'Contact & visit'}.get(n.attrs.get('id'),n.attrs.get('class','Homepage').replace('-',' ').title())
 if n.tag=='footer':group='Footer'
 classes=n.attrs.get('class','').split()
 locked=locked or n.attrs.get('id','').startswith('managed-') or 'loading-state' in classes or 'image-credit' in classes
 target=n.tag in ['h1','h2','h3','p','blockquote','cite','li'] or 'eyebrow' in classes or 'photo-caption' in classes or (n.tag=='a' and n.parent and n.parent.tag=='nav')
 if target and not locked:
  value=n.text().strip();key='copy_'+str(len(fields)+1);n.attrs['data-copy']=key
  fields.append({'key':key,'group':group,'label':value.replace('\n',' ')[:75],'default':value,'max':5000 if n.tag in ['p','li','blockquote'] else 300})
  locked=True
 for child in n.children:visit(child,group,locked)
visit(parser.root)
extra={
 'blogTitle':('Parish stories','Stories from our parish.'),'blogDescription':('Parish stories','Reflections, news, and moments from our parish community.'),
 'eventsTitle':('Events page','Gather. Celebrate. Belong.'),'eventsDescription':('Events page','Discover what is happening in our community. Event times are shown in Philippine time.'),
 'schedulesTitle':('Schedules page','Make time for prayer.'),'schedulesDescription':('Schedules page','Published worship schedules and parish activities. All times are Philippine time.'),
 'collectionsTitle':('Collections page','Your generosity, shared openly.'),'collectionsDescription':('Collections page','A public record of the Sunday collections reported by our parish. Thank you for your continued generosity.'),
 'peopleTitle':('Parish people','Serving with faith. Remembered with gratitude.'),'peopleDescription':('Parish people','Meet the priests, council officers, choir members, and staff who serve our parish, and explore their history of service.'),
 'peopleHomeTitle':('Parish people','The people who serve our parish.'),'peopleHomeDescription':('Parish people','Our priests, Parish Pastoral Council, choir, and parish staff.'),
 'priestsLabel':('Parish people','Parish priests'),'ppcLabel':('Parish people','Parish Pastoral Council'),'choirLabel':('Parish people','Choir members'),'staffLabel':('Parish people','Secretariat & staff')}
for key,(group,value) in extra.items():fields.append({'key':key,'group':group,'label':key,'default':value,'max':2000})
(root/'public/index.html').write_text(parser.root.output())
(root/'server/copy-schema.js').write_text('export const copyFields='+json.dumps(fields,ensure_ascii=False,indent=2)+';\n')
print('Prepared',len(fields),'editable page content fields')
