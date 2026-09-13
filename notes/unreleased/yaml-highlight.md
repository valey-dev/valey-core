---
title: YAML files are highlighted on the board, and comments in code read at last
scope: board
shots:
  - id: yaml-file
    keys: "Enter,wait:4500"
    viewport: "1400,860"
    setup: "const YML="# CI for the rocket shop\nname: Tests\non:\n  push:\n    branches: [main, \"release/*\"]\nenv:\n  NODE: 22\n  CACHE: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install and test\n        run: |\n          npm ci\n          npm test -- --reporter=dot\n      - name: Deploy preview\n        if: github.ref == \"refs/heads/main\"\n        env: { STAGE: preview }\n        run: ./deploy.sh --stage preview # needs the token\n"; const MD="# Release checklist\n\nThe shop deploys from its CI file:\n\n\x60\x60\x60yaml\ndeploy:\n  retries: 3 # then give up\n  notify: [ops, \"#releases\"]\n\x60\x60\x60\n\nAnd the discount is one function:\n\n\x60\x60\x60js\n// ten percent off above a hundred\nconst discount = (sum) => sum > 100 ? sum * 0.1 : 0;\n\x60\x60\x60\n"; const P="/Users/kolya/Projects/rocket-shop/.github/workflows/test.yml"; const real=window.fetch.bind(window); window.fetch=(u,o)=>String(u).startsWith('/api/file')?Promise.resolve(new Response(decodeURIComponent(String(u)).endsWith('.md')?MD:YML)):real(u,o); setTimeout(()=>import('/ui.js').then((m)=>m.openFile(P)),3200)"
  - id: yaml-fence
    keys: "Enter,wait:4500"
    viewport: "1400,860"
    setup: "const YML="# CI for the rocket shop\nname: Tests\non:\n  push:\n    branches: [main, \"release/*\"]\nenv:\n  NODE: 22\n  CACHE: true\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install and test\n        run: |\n          npm ci\n          npm test -- --reporter=dot\n      - name: Deploy preview\n        if: github.ref == \"refs/heads/main\"\n        env: { STAGE: preview }\n        run: ./deploy.sh --stage preview # needs the token\n"; const MD="# Release checklist\n\nThe shop deploys from its CI file:\n\n\x60\x60\x60yaml\ndeploy:\n  retries: 3 # then give up\n  notify: [ops, \"#releases\"]\n\x60\x60\x60\n\nAnd the discount is one function:\n\n\x60\x60\x60js\n// ten percent off above a hundred\nconst discount = (sum) => sum > 100 ? sum * 0.1 : 0;\n\x60\x60\x60\n"; const P="/Users/kolya/Projects/rocket-shop/RELEASE.md"; const real=window.fetch.bind(window); window.fetch=(u,o)=>String(u).startsWith('/api/file')?Promise.resolve(new Response(decodeURIComponent(String(u)).endsWith('.md')?MD:YML)):real(u,o); setTimeout(()=>import('/ui.js').then((m)=>m.openFile(P)),3200)"
---

A `.yml` or `.yaml` file an agent touched opened on the board as plain text — a CI workflow, a compose file, a config — and a yaml code block in a markdown document did the same. Both are highlighted now, in the colours the board already uses for JSON and JavaScript: keys like JSON keys, strings, numbers, `true`/`yes`/`~` as literals, anchors and tags, comments.

A block after `run: |` or `key: >` stays one piece of text, so a shell line such as `echo a: b` inside a CI step does not come out as a key, and a `#` inside a quoted string or a URL is not taken for a comment.

Comments and punctuation in code were dimmer than the rest of the office's small print — 2.9 to 1 on the board, 3.5 inside markdown blocks. They take the office's one readable muted tone now.
