"""Regenerate src/data/recipes.json and src/assets/sprite.webp from a FactorioLab checkout.

Usage: python3 scripts/prep-data.py /path/to/factoriolab
(git clone --depth 1 https://github.com/factoriolab/factoriolab first)
"""
import json, sys, os, shutil
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(sys.argv[1], 'public', 'data', 'dsp') + '/'
d=json.load(open(src+'data.json'))
icons={i['id']:(i['x'],i['y'],i.get('color','#888')) for i in d['icons']}
items={i['id']:i for i in d['items']}
rs=[r for r in d['recipes'] if 'technology' not in r.get('flags',[]) and r['category'] in('components','buildings')]
mach={}
for i in d['items']:
    for k in('machine','belt','module','fuel'):
        pass
recipes=[]
prodset=set(d['limitations']['productivity'])
used_items=set()
for r in rs:
    ins=r['in']; outs=r['out']
    if not outs: continue
    rec={'id':r['id'],'name':r['name'],'time':r['time'],'in':ins,'out':outs,'prod':r['producers'],
         'mining':'mining' in r.get('flags',[]),'prolif':r['id'] in prodset}
    if r.get('icon'): rec['icon']=r['icon']
    if r.get('cost') is not None: rec['cost']=r['cost']
    recipes.append(rec)
    used_items.update(ins); used_items.update(outs)
    used_items.update(r['producers'])
machines={}
for mid in sorted(set(p for r in recipes for p in r['prod'])):
    m=items[mid]['machine']
    machines[mid]={'name':items[mid]['name'],'speed':m.get('speed',1),'usage':m.get('usage',0),'drain':m.get('drain',0),'mods':m.get('modules',0),'cons':m.get('consumption')}
mods={}
for i in d['items']:
    if 'module' in i:
        mods[i['id']]=i['module']|{'name':i['name']}
used_items.update(['conveyor-belt-1','conveyor-belt-2','conveyor-belt-3','proliferator-1','proliferator-2','proliferator-3'])
for p in d['limitations']: pass
itemlist=[]
for i in d['items']:
    if i['id'] in used_items:
        ic=i.get('icon',i['id'])
        if ic not in icons: print('noicon',i['id'],ic,file=sys.stderr); 
        itemlist.append({'id':i['id'],'name':i['name'],'cat':i['category'],'ic':ic})
icmap={}
for it in itemlist: icmap[it['ic']]=icons.get(it['ic'])
for r in recipes:
    if 'icon' in r: icmap[r['icon']]=icons.get(r['icon'])
out={'version':d['version'],'items':itemlist,'recipes':recipes,'machines':machines,'mods':mods,
     'icons':{k:v for k,v in icmap.items() if v},'excluded':d['defaults']['excludedRecipes']}
dst = os.path.join(root, 'src', 'data', 'recipes.json')
json.dump(out, open(dst, 'w'), separators=(',', ':'))
shutil.copy(src + 'icons.webp', os.path.join(root, 'src', 'assets', 'sprite.webp'))
print(len(recipes), 'recipes,', len(itemlist), 'items,', len(machines), 'machines')
