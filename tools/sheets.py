import json, urllib.request, io, os, concurrent.futures as cf
from PIL import Image, ImageDraw, ImageFont
P=json.load(open('photos.json',encoding='utf8'))
os.makedirs('sheets',exist_ok=True)
items=list(P.items())
UA={'User-Agent':'UbicateSantiago/1.0 (personal educational map quiz; https://www.openstreetmap.org/) python'}
def get(u):
    u=u.replace('/800px-','/240px-')
    for t in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
            return Image.open(io.BytesIO(r)).convert('RGB')
        except Exception as e:
            err=e
    return None
try: font=ImageFont.truetype('arial.ttf',13)
except: font=ImageFont.load_default()
W,H,C=240,180,6
with cf.ThreadPoolExecutor(4) as ex:
    imgs=list(ex.map(lambda kv:get(kv[1][0]['u']),items))
per=C*5
for s in range(0,len(items),per):
    sheet=Image.new('RGB',(C*W,5*(H+30)),'white');d=ImageDraw.Draw(sheet)
    for i,(kv,im) in enumerate(zip(items[s:s+per],imgs[s:s+per])):
        x,y=(i%C)*W,(i//C)*(H+30)
        if im:
            im.thumbnail((W-4,H)); sheet.paste(im,(x+2,y))
        d.text((x+3,y+H+2),f"{s+i} {kv[0]}"[:36],fill='black',font=font)
    sheet.save(f'sheets/s{s//per:02d}.jpg',quality=80)
print('sheets',(len(items)+per-1)//per)
