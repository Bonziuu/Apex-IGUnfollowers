#!/usr/bin/env python3
"""Render the ten approved pixel-locked Chrome Web Store screenshots. Staging only.
Source screenshots are real v1.2.2 panel captures from the previous GitHub CI
artifact. Only PNG/JPG images will be promoted into main; this script stays on
the temporary staging branch.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math, numpy as np, io, os, sys
import cairosvg

SRC = Path(os.environ.get('APEX_SOURCE', '/tmp/apex-cws-source'))
OUT = Path(os.environ.get('APEX_OUTPUT', 'store/screenshots'))
W,H,S = 1280,800,2
FONT_HEAVY='/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'
FONT_BOLD='/usr/share/fonts/opentype/inter/Inter-Bold.otf'
FONT_REG='/usr/share/fonts/opentype/inter/Inter-Regular.otf'
FONT_ITAL='/usr/share/fonts/opentype/inter/Inter-Italic.otf'
BRAND=(202,15,104); DARK=(29,21,29); BODY=(80,68,83)
B={'brand_icon':(67,48,48,48),'brand_text':(126,64),'headline_1':(65,187),
   'headline_2':(65,276),'description_1':(68,432),'description_2':(68,472),
   'panel_box':(825,30,1233,768),'demo_right_bottom':(1211,772),
   'chips_boxes':[(67,582,278,638),(288,582,504,638),(514,582,790,638)]}
copy={
'en':[
  dict(id='01-lists',title=("See who doesn't",'follow you back.'),desc=('Compare followers and following','in one clear view.'),chips=('Free','No password','In your browser'),highlight='lists'),
  dict(id='02-changes',title=('See who unfollowed.','See who joined.'),desc=('Compare scans to spot changes.','History starts after the second scan.'),chips=('Track changes','Local history','Two-scan comparison'),highlight='changes'),
  dict(id='03-stats',title=('Track your followers','over time.'),desc=('View your 7- and 30-day balance,','follower chart and scan history.'),chips=('Follower trend','7 / 30 days','Scan history'),highlight='stats'),
  dict(id='04-unfollow',title=('Unfollow carefully.','Stay in control.'),desc=('One account at a time,','with confirmation and daily limits.'),chips=('Manual action','Confirmation','15-second breaks'),highlight='unfollow'),
  dict(id='05-welcome',title=('No password.','No Apex account.'),desc=('Uses your Instagram session.','Scan results stay in your browser.'),chips=('No password','No telemetry','Open source'),highlight='welcome')
],
'pl':[
  dict(id='01-lists',title=('Kto Cię nie obserwuje?','Sprawdź to.'),desc=('Porównaj obserwujących','i obserwowanych w jednym miejscu.'),chips=('Za darmo','Bez hasła','W przeglądarce'),highlight='lists'),
  dict(id='02-changes',title=('Zobacz, kto odszedł.','Kto dołączył?'),desc=('Porównuj skany i wykrywaj zmiany.','Historia działa od drugiego skanu.'),chips=('Zmiany kont','Lokalna historia','Porównanie skanów'),highlight='changes'),
  dict(id='03-stats',title=('Śledź obserwujących','w czasie.'),desc=('Sprawdzaj bilans z 7 i 30 dni,','wykres i historię skanów.'),chips=('Wykres zmian','Bilans 7 / 30 dni','Historia skanów'),highlight='stats'),
  dict(id='04-unfollow',title=('Odobserwuj ręcznie.','Zachowaj kontrolę.'),desc=('Jedno konto naraz, z potwierdzeniem,','przerwami i limitem dziennym.'),chips=('Ręczna akcja','Potwierdzenie','15 sekund przerwy'),highlight='unfollow'),
  dict(id='05-welcome',title=('Bez hasła.','Bez konta Apex.'),desc=('Wtyczka używa sesji Instagrama.','Wyniki zostają w przeglądarce.'),chips=('Bez hasła','Bez telemetrii','Otwarty kod'),highlight='welcome')
]}
svg_logo='''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="0.42" y2="1"><stop offset="0" stop-color="#f2559f"/><stop offset="1" stop-color="#cc1670"/></linearGradient></defs><g transform="translate(0 4.5)"><path fill="url(#g)" fill-rule="evenodd" d="M64 7 116 112H91L64 59 37 112H12L64 7Zm0 34-12 25h24L64 41Z"/></g></svg>'''
logo=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg_logo.encode(),output_width=96,output_height=96))).convert('RGBA')
def glyph(kind,color=BRAND):
    im=Image.new('RGBA',(64,64),(0,0,0,0));d=ImageDraw.Draw(im);col=(*color,255)
    if kind=='bolt':d.polygon([(35,6),(19,32),(31,32),(26,58),(49,26),(36,26),(42,6)],fill=col)
    elif kind=='swap':
        d.arc((7,6,53,52),35,230,fill=col,width=6);d.arc((12,9,58,54),210,405,fill=col,width=6)
        d.polygon([(8,9),(10,27),(25,20)],fill=col);d.polygon([(53,57),(39,43),(55,38)],fill=col)
    elif kind=='chart':
        d.line([(7,49),(21,34),(33,39),(49,17)],fill=col,width=6,joint='curve')
        d.polygon([(40,15),(57,11),(54,28)],fill=col)
    elif kind=='hand':
        d.rounded_rectangle((22,19,43,54),7,outline=col,width=5);d.line([(27,27),(27,7)],fill=col,width=5)
    elif kind=='lock':
        d.arc((17,7,48,41),180,360,fill=col,width=6)
        d.rounded_rectangle((15,28,49,56),5,outline=col,width=5);d.ellipse((29,37,35,43),fill=col)
    return im.resize((26*S,26*S),Image.Resampling.LANCZOS)
def background():
    sw,sh=W*S,H*S
    y,x=np.mgrid[0:sh,0:sw].astype(np.float32)
    xx=x/sw;yy=y/sh
    base=np.stack([np.ones_like(xx)*255,np.ones_like(xx)*253,np.ones_like(xx)*254],axis=-1)
    g1=np.exp(-((xx-.87)/.52)**2-((yy-.10)/.36)**2)*.58
    g2=np.exp(-((xx-.10)/.54)**2-((yy-.78)/.60)**2)*.24
    g3=np.exp(-((xx-.63)/.7)**2-((yy-1.15)/.7)**2)*.22
    for m,clr in [(g1,(255,215,236)),(g2,(253,229,244)),(g3,(253,238,248))]:
        base=base*(1-m[...,None])+np.array(clr)[None,None,:]*m[...,None]
    img=Image.fromarray(np.asarray(np.clip(base,0,255),dtype='uint8'),'RGB').convert('RGBA')
    overlay=Image.new('RGBA',(sw,sh),(0,0,0,0));d=ImageDraw.Draw(overlay)
    def wave(y_func,color):
        coords=[(int(t*S),int(y_func(t)*S)) for t in range(-20,850,3)]
        coords += [(850*S,H*S),(0,H*S)]
        d.polygon(coords,fill=color)
    wave(lambda t:632+.24*t+23*math.sin((t-80)/180),(249,162,211,153))
    wave(lambda t:697+.18*t+22*math.sin((t+60)/220),(236,70,158,183))
    wave(lambda t:729+.15*t+19*math.sin((t+15)/240),(199,19,108,219))
    return Image.alpha_composite(img,overlay)
BASE=background()
def font(path,size):return ImageFont.truetype(path,size*S)
font_brand=font(FONT_BOLD,25)
font_head=font(FONT_HEAVY,61)
font_desc=font(FONT_REG,25)
font_badge=font(FONT_BOLD,18)
font_demo=font(FONT_ITAL,14)
probe=ImageDraw.Draw(BASE)
for lang in copy:
    for item in copy[lang]:
        for txt in item['title']:
            if probe.textlength(txt,font=font_head)/S>705: raise RuntimeError('Title too wide: '+lang+'/'+txt)
        for txt in item['desc']:
            if probe.textlength(txt,font=font_desc)/S>690:raise RuntimeError('Description too wide: '+lang+'/'+txt)
        for txt,c in zip(item['chips'],B['chips_boxes']):
            if probe.textlength(txt,font=font_badge)/S+55>c[2]-c[0]:raise RuntimeError('Chip too wide: '+lang+'/'+txt)

def source_image(lang,item):
    for p in [SRC/lang/(item['id']+'-1280x800.jpg'),SRC/'store'/'screenshots'/lang/(item['id']+'-1280x800.jpg')]:
        if p.exists():return p
    raise FileNotFoundError('Missing genuine UI capture: '+str(SRC/lang/(item['id']+'-1280x800.jpg')))
def comp_panel(lang,item):
    src=Image.open(source_image(lang,item)).convert('RGB')
    crop=src.crop((795,32,1199,767))
    x0,y0,x1,y1=B['panel_box']
    return crop.resize(((x1-x0)*S,(y1-y0)*S),Image.Resampling.LANCZOS).convert('RGBA')
def draw_panel(im,lang,item):
    x0,y0,x1,y1=B['panel_box'];x0*=S;y0*=S;x1*=S;y1*=S
    mask=Image.new('L',(x1-x0,y1-y0),0);mm=ImageDraw.Draw(mask)
    mm.rounded_rectangle((3*S,3*S,x1-x0-3*S,y1-y0-3*S),radius=22*S,fill=255)
    shadow_layer=Image.new('RGBA',im.size,(0,0,0,0));d=ImageDraw.Draw(shadow_layer)
    d.rounded_rectangle((x0+5*S,y0+13*S,x1+6*S,y1+13*S),radius=27*S,fill=(104,10,62,110))
    im.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(24*S)))
    im.paste(comp_panel(lang,item),(x0,y0),mask)
    hi={
      'lists':(x0+16*S,y0+147*S,x0+131*S,y0+192*S),
      'changes':(x0+18*S,y0+298*S,x1-25*S,y0+450*S),
      'stats':(x0+18*S,y0+440*S,x1-25*S,y0+616*S),
      'unfollow':(x0+18*S,y0+270*S,x1-25*S,y0+318*S),
      'welcome':(x0+16*S,y0+372*S,x1-20*S,y0+564*S)
    }
    if item['highlight']!='welcome':
        d=ImageDraw.Draw(im)
        d.rounded_rectangle(hi[item['highlight']],radius=12*S,outline=(220,15,124,225),width=2*S)
        if item['highlight']=='changes':
            d.rounded_rectangle((x0+18*S,y0+451*S,x1-25*S,y0+650*S),
                                radius=12*S,outline=(28,162,91,210),width=2*S)
def draw_swoosh(im):
    d=ImageDraw.Draw(im);pts=[]
    for x in range(65*S,685*S,6):
        t=(x-65*S)/(620*S)
        y=(384-11*math.sin(math.pi*t))*S
        pts.append((x,int(y)))
    d.line(pts,fill=(234,62,162,174),width=6*S,joint='curve')
    for a,b in [((696,165),(707,148)),((706,187),(725,172)),((718,205),(738,202))]:
        d.line(((a[0]*S,a[1]*S),(b[0]*S,b[1]*S)),fill=(220,28,127,208),width=6*S)
def draw_chips(im,item):
    d=ImageDraw.Draw(im)
    for i,(txt,rect) in enumerate(zip(item['chips'],B['chips_boxes'])):
        x0,y0,x1,y1=[v*S for v in rect]
        d.rounded_rectangle((x0,y0,x1,y1),radius=29*S,fill=(252,225,239,228),
                            outline=(248,204,225,255),width=1*S)
        im.alpha_composite(glyph(['bolt','lock','chart'][i]),(x0+14*S,y0+15*S))
        d.text((x0+50*S,y0+17*S),txt,font=font_badge,fill=BRAND,stroke_width=0)
def render_one(lang,item):
    im=BASE.copy();draw_panel(im,lang,item);draw_swoosh(im);draw_chips(im,item)
    d=ImageDraw.Draw(im)
    x,y,w,h=B['brand_icon']
    im.alpha_composite(logo.resize((w*S,h*S),Image.Resampling.LANCZOS),(x*S,y*S))
    d.text(tuple(v*S for v in B['brand_text']),'Apex Unfollowers',font=font_brand,fill=BRAND)
    for i,k in enumerate(('headline_1','headline_2')):
        x,y=B[k];d.text((x*S,y*S),item['title'][i],font=font_head,fill=DARK if i==0 else BRAND)
    for i,k in enumerate(('description_1','description_2')):
        x,y=B[k];d.text((x*S,y*S),item['desc'][i],font=font_desc,fill=BODY)
    x,y=B['demo_right_bottom']
    d.text((x*S,y*S),'Demo data' if lang=='en' else 'Dane demonstracyjne',
           font=font_demo,fill=(135,112,133),anchor='ra')
    out=im.convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
    p=OUT/lang/(item['id']+'-1280x800.jpg')
    p.parent.mkdir(parents=True,exist_ok=True)
    out.save(p,'JPEG',quality=95,optimize=True,subsampling=0)
    print(p,len(p.read_bytes()),flush=True)
for lang in copy:
    for item in copy[lang]:render_one(lang,item)
