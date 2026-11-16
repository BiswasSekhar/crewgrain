"""Offline catalog authoring only. Model files stay in LOCALAPPDATA, outside Expo."""
import importlib.util, json, os, re, sys, time
from pathlib import Path
import onnxruntime as ort
import types, importlib
package = types.ModuleType("IndicTransToolkit")
package.__path__ = [str(Path(os.environ["LOCALAPPDATA"]) / "CrewgrainLocalizationCache/venv/Lib/site-packages/IndicTransToolkit")]
sys.modules["IndicTransToolkit"] = package
package.IndicProcessor = importlib.import_module("IndicTransToolkit.processor").IndicProcessor
root = Path(__file__).resolve().parents[1]
original = ort.InferenceSession
opts = ort.SessionOptions()
opts.intra_op_num_threads = 3
opts.inter_op_num_threads = 1
ort.InferenceSession = lambda path, **kw: original(path, sess_options=opts, **kw)
spec = importlib.util.spec_from_file_location('indic_onnx', Path(os.environ['LOCALAPPDATA']) / 'CrewgrainLocalizationCache/indictrans2-int8/translate.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = module.IndicTransONNX(Path(os.environ['LOCALAPPDATA']) / 'CrewgrainLocalizationCache/indictrans2-int8')
en = json.loads((root / 'src/locales/en.json').read_text('utf-8'))
context = json.loads((root / 'scripts/translation-context.json').read_text('utf-8'))
en = {k: context.get(v, re.sub(r'\boperation(s?)\b', r'sewing operation\1', v)) for k,v in en.items()}
for language, tag in [('as','asm_Beng'),('bn','ben_Beng'),('brx','brx_Deva'),('doi','doi_Deva'),('gom','gom_Deva'),('gu','guj_Gujr'),('hi','hin_Deva'),('kn','kan_Knda'),('ks','kas_Arab'),('mai','mai_Deva'),('ml','mal_Mlym'),('mni-Mtei','mni_Mtei'),('mr','mar_Deva'),('ne','npi_Deva'),('or','ory_Orya'),('pa','pan_Guru'),('sa','san_Deva'),('sat','sat_Olck'),('sd','snd_Arab'),('ta','tam_Taml'),('te','tel_Telu'),('ur','urd_Arab')]:
    file = root / f'src/locales/{language}.json'
    catalog = json.loads(file.read_text('utf-8'))
    missing = [(k,v) for k,v in en.items() if not catalog.get(k)]
    print(language, len(missing), flush=True)
    for i,(key,value) in enumerate(missing):
        if not re.search('[A-Za-z]', re.sub(r'{{.*?}}', '', value)):
            translated = value
        else:
            placeholders = re.findall(r'{{.*?}}', value)
            protected = value
            for index, token in enumerate(placeholders): protected = protected.replace(token, f' crewgrainvalue{index}@example.invalid ', 1)
            translated = model.translate(protected, 'eng_Latn', tag, max_new_tokens=256)
            for index, token in enumerate(placeholders):
                translated = re.sub(re.escape(f'crewgrainvalue{index}@example.invalid'), lambda _: token, translated, flags=re.I)
            if sorted(re.findall(r'{{.*?}}',translated)) != sorted(placeholders):
                # Numerals are natural in quantity/rate sentences and are
                # protected as entities by IndicProcessor, unlike adjacent emails.
                protected = value
                for index, token in enumerate(placeholders): protected = protected.replace(token, f' {9182730 + index} ', 1)
                translated = model.translate(protected, 'eng_Latn', tag, max_new_tokens=256)
                import unicodedata
                translated = ''.join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in translated)
                for index, token in enumerate(placeholders): translated = translated.replace(str(9182730 + index), token)
                if sorted(re.findall(r'{{.*?}}',translated)) != sorted(placeholders):
                    print('placeholder failure:', key, '=>', translated, flush=True)
                    continue
        if not value.rstrip().endswith(('.', '!', '?')): translated = translated.rstrip('।.۔ ')
        catalog[key] = translated
        if i % 10 == 0:
            file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(language, i+1, '/', len(missing), flush=True)
    file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
