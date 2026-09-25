import JSZip from 'jszip';

export interface FixtureOptions {
  withNav?: boolean;
  withNcx?: boolean;
  brokenChapter?: boolean;
  noOpf?: boolean;
  duplicateManifest?: boolean;
}

export async function makeEpub(o: FixtureOptions = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  if (!o.noOpf) zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Pride and Prejudice</dc:title><dc:creator>Jane Austen</dc:creator>
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover" href="images/cover.png" media-type="image/png"/>
    <item id="pic" href="images/pic%201.png" media-type="image/png"/>
    ${o.duplicateManifest ? '<item id="pic2" href="images/pic%201.png" media-type="image/png"/>' : ''}
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`);
  if (o.withNav !== false) zip.file('OEBPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Chapter I</a></li><li><a href="text/ch2.xhtml#top">Chapter II</a></li></ol></nav></body></html>`);
  if (o.withNcx) zip.file('OEBPS/toc.ncx', `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
<navPoint id="n1"><navLabel><text>One</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
<navPoint id="n2"><navLabel><text>Two</text></navLabel><content src="text/ch2.xhtml"/></navPoint></navMap></ncx>`);
  zip.file('OEBPS/text/ch1.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head>
<body><h1>Chapter I</h1><p>It is a truth universally acknowledged.</p><img src="../images/pic%201.png"/></body></html>`);
  zip.file('OEBPS/text/ch2.xhtml', o.brokenChapter ? '<html><body><p>unclosed' : `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Mr. Bennet.</p></body></html>`);
  zip.file('OEBPS/images/cover.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('OEBPS/images/pic 1.png', new Uint8Array([1]));
  zip.file('OEBPS/style.css', 'p { margin: 0 }');
  return zip.generateAsync({ type: 'arraybuffer' });
}
