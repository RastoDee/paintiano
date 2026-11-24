# EPUB -> the app's book files: api/_book/<LANG>.js (the text, chapters in reading order; served by /api/book) + public/bookr/img/<hash>.<ext>
# NOTE (24 Nov 2026): the texts in api/_book were also edited by hand after the first run — compare before overwriting.
# usage: python3 conv.py <folder with paintiano-<LANG>.epub> public/bookr
import zipfile,re,json,hashlib,os,sys,glob
SRC,OUT=sys.argv[1],sys.argv[2]
os.makedirs(OUT+'/img',exist_ok=True)
tot={}
for f in sorted(glob.glob(SRC+'/paintiano-*.epub')):
    L=os.path.basename(f)[10:-5]; z=zipfile.ZipFile(f); names=z.namelist()
    opf=[x for x in names if x.endswith('.opf')][0]; base=opf.rsplit('/',1)[0]+'/' if '/' in opf else ''
    o=z.read(opf).decode('utf8')
    man=dict(re.findall(r'<item\b[^>]*?\bid="([^"]+)"[^>]*?\bhref="([^"]+)"',o)); man.update({a:b for b,a in re.findall(r'<item\b[^>]*?\bhref="([^"]+)"[^>]*?\bid="([^"]+)"',o)})
    spine=re.findall(r'<itemref\b[^>]*idref="([^"]+)"',o)
    navf=[x for x in names if x.endswith('nav.xhtml')][0]; nav=dict(re.findall(r'<a href="([^"#]+)[^"]*"[^>]*>([^<]+)',z.read(navf).decode('utf8')))
    title=re.search(r'<dc:title[^>]*>([^<]*)',o).group(1)
    def img(m):
        src=m.group(1); p=os.path.normpath(base+src).replace('\\','/'); d=z.read(p); ext=p.rsplit('.',1)[1].lower()
        n=hashlib.md5(d).hexdigest()[:14]+'.'+ext; fp=OUT+'/img/'+n
        if not os.path.exists(fp): open(fp,'wb').write(d)
        return 'src="/bookr/img/%s"'%n
    ch=[]
    for i in spine:
        h=man[i]
        if h.endswith('cover.xhtml'): continue
        x=z.read(base+h).decode('utf8'); b=re.search(r'<body[^>]*>(.*)</body>',x,re.S).group(1).strip()
        assert not re.search(r'<script|on[a-z]+=|javascript:',b,re.I), (L,h)
        b=re.sub(r'src="([^"]+)"',img,b)
        b=re.sub(r'<a href="(https?://[^"]+)"',r'<a target="_blank" rel="noopener" href="\1"',b)
        t=nav.get(h) or (re.search(r'<title>([^<]*)',x).group(1))
        ch.append({'id':h.rsplit('.',1)[0],'t':t,'n':len(re.sub(r'<[^>]+>','',b)),'h':b})
    cov=hashlib.md5(z.read(base+'cover.jpg')).hexdigest()[:14]+'.jpg'
    if not os.path.exists(OUT+'/img/'+cov): open(OUT+'/img/'+cov,'wb').write(z.read(base+'cover.jpg'))
    # the text is NOT public: it goes to api/_book/<LANG>.js and is served by /api/book to a licence key or a book code only
    API=os.path.join(os.path.dirname(OUT.rstrip('/')),'..','api','_book'); os.makedirs(API,exist_ok=True)
    js='// the book, '+L+' — made from the EPUB (documentation/book-reader); served only by /api/book\nexport default '+json.dumps({'v':1,'lang':L,'title':title,'cover':'/bookr/img/'+cov,'ch':ch},ensure_ascii=False,separators=(',',':'))+';\n'
    open(API+'/%s.js'%L,'w',encoding='utf8').write(js)
    tot[L]=(len(ch),len(js))
print(tot); print('imgs',len(os.listdir(OUT+'/img')),round(sum(os.path.getsize(OUT+'/img/'+x) for x in os.listdir(OUT+'/img'))/1e6,2),'MB')
