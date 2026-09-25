"""Import the two approved Word questionnaires, preserving inline diagrams."""
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
import json, re, sys, hashlib

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'a':'http://schemas.openxmlformats.org/drawingml/2006/main', 'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
quizzes = []
for number, word in enumerate(['一','二'], 1):
    path = source / f'科学概念知识理解测试-第{word}节课（标注答案版）.docx'
    with ZipFile(path) as z:
        rels = {x.get('Id'):x.get('Target') for x in etree.fromstring(z.read('word/_rels/document.xml.rels'))}
        doc = etree.fromstring(z.read('word/document.xml'))
        quiz = {'id':f'lesson-{number}', 'version':1, 'title':'', 'instructions':[], 'questions':[]}
        target = None
        for p in doc.xpath('//w:body//w:p', namespaces=ns):
            text = ''.join(p.xpath('.//w:t/text()', namespaces=ns)).strip()
            answer = re.search(r'（\s*([A-G])\s*）', text)
            option = re.match(r'^([A-G])\.(.*)', text)
            if answer:
                q = {'id':str(len(quiz['questions'])+1), 'text':re.sub(r'^（\d+）','',text[:answer.start()]+ '（　）'+text[answer.end():]), 'answer':answer[1], 'options':[], 'images':[]}
                quiz['questions'].append(q)
                target = q
            elif option:
                target = {'id':option[1], 'text':option[2], 'images':[]}
                quiz['questions'][-1]['options'].append(target)
            elif text and not quiz['questions']:
                if not quiz['title']: quiz['title'] = text
                else: quiz['instructions'].append(text)
            for rid in p.xpath('.//a:blip/@r:embed', namespaces=ns):
                media = rels[rid]
                name = f'{number}-{Path(media).name}'
                dest = root / 'public' / 'quiz-images' / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                contents=z.read('word/'+media)
                dest.write_bytes(contents)
                image_target = quiz['questions'][-1] if number == 1 else target
                image_target['images'].append('/quiz-images/'+name+'?v='+hashlib.sha256(contents).hexdigest()[:12])
        assert len(quiz['questions']) == 10
        assert all(q['answer'] in [o['id'] for o in q['options']] for q in quiz['questions'])
        quizzes.append(quiz)
(root / 'quizzes.json').write_text(json.dumps(quizzes,ensure_ascii=False,indent=2),encoding='utf-8')
print('Imported 2 quizzes, 20 questions; answers saved outside public.')
