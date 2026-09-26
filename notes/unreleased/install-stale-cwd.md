---
title: An update run from inside the office tells the terminal where the new office is
scope: install
nopicture: a line printed in the terminal by install.sh
---

`install.sh --update` sets the old office aside as `~/valey.v<version>` and puts the new one in its place. A terminal that was standing in `~/valey` goes with the folder, not the name: the prompt still says `~/valey`, but `npm start` there starts the old version — and once the old copy is deleted, it dies on `ENOENT: no such file or directory, uv_cwd`. When the update is run from inside the office, the installer now says so and prints the `cd` that leads to the new one.
