import re, sys
R = lambda p: open(p, encoding='utf-8').read()

body = R('src/body.html')
for key, f in [('EMBLEM','src/frag-emblem.html'),('GEAR','src/frag-gear.html'),('HERO','src/frag-hero.html'),('KEY','src/frag-key.html'),('CHEST','src/frag-chest.html')]:
    body = body.replace('{{%s}}' % key, R(f).rstrip('\n'))
assert '{{' not in body, 'placeholder nao substituido'

css = R('src/style.base.css').rstrip() + '\n' + R('src/style.add.css') + '\n' + R('src/style.theme.css') + '\n' + R('src/style.battle.css')
js = ''.join(R('js/%s' % n) for n in ['00-core.js','10-combat.js','20-loot.js','30-meta.js','35-online.js','40-ui.js'])

CFG_TAG = '' if '--artifact' in sys.argv else '  <script src="config.js"></script>\n'
html = '''<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#1b3629" />
  <title>Guardiões do Baú</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
%s
  </style>
</head>
<body>
  %s

%s  <script>
    document.addEventListener('DOMContentLoaded', function () {
      'use strict';
      try {
%s
      } catch (err) {
        console.error('Erro ao inicializar Guardiões do Baú:', err);
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:999;background:#7f1d1d;color:#fff;padding:10px;border-radius:10px;font:12px system-ui';
        box.textContent = 'Erro ao iniciar o jogo: ' + (err && err.message ? err.message : err);
        document.body.appendChild(box);
      }
    });
  </script>
</body>
</html>
''' % (css, body, CFG_TAG, js)
out = [a for a in sys.argv[1:] if not a.startswith('--')][0] if len([a for a in sys.argv[1:] if not a.startswith('--')]) else 'dist/index.html'
import os; os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print(out, len(html)//1024, 'KB', html.count('\n'), 'linhas')
