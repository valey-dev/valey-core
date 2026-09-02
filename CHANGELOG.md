# Changelog

Что менялось от релиза к релизу, новое сверху. Разделы собираются из
конвенциональных префиксов коммитов — `node tools/release.mjs minor`.

Три вещи, чтобы файл не вводил в заблуждение. **Хеши ведут в историю проекта, а
не в этот репозиторий**: он начат с одного коммита, и найти по ним ничего
нельзя. **Часть записей описывает модули, которых здесь нет** — офис состоит из
ядра и папки `modules/`, и не все модули лежат рядом с ядром. И **записи про
внутренние документы вырезаны**: они указывали на файлы, которых в публичном
репозитории нет, и читателю не говорили ничего.

## v0.2.0 — 30 августа 2026

### Новое

- **sheet:** a state sheet the code draws, not a hand copy (dce61be)
- **office:** the lounge moves down to the service tier (cccbd00)
- **lift:** the service tier is floor 1, not the basement (4b9aa59)
- **security:** a suspended file gets a red stamp, and the cabinet is solid (043f0c8)
- **security:** the filing cabinet hands out personnel files (be26b75)
- **office:** the meeting room, second room of the service tier (b2e506c)
- **names:** give names back when a session is gone, and a gender with each (bbf4e60)
- **name:** the office is called Valey (d09c65f)
- **card,viewer:** the last two click-only spots take the keyboard (f2db84f)
- **panels:** переодеться, окно в мир and цвет офиса take the keyboard (dbdbdb8)
- **notes:** the notes panel answers to the keyboard (40339e1)
- **panels:** обход and the radio answer to the keyboard (4194749)
- **layout:** the office grows upward and is numbered from the ground (56a4734)
- **lift:** floors can be picked from the keyboard (c17543d)
- **shot:** arrow keys, so keyboard work can be checked by keyboard (e1f4ab9)
- **dialog:** the file list answers to the keyboard (64fd509)
- **office:** hang the night-shift poster in the control room (0065520)
- **shot:** record the walk, not just one frame of it (0e6a879)

### Починено

- **release:** the last tag is not the last release (94bf6d4)
- **shot:** F9 works while the cameras are on, and the letter keys exist (cf4ab69)
- **ui:** two vh values mean what they say at 175% (a0b5bf0)
- **sessions:** one session is one person, even in two files (a313277)
- **shot:** an unknown key in --keys fails instead of doing nothing (237608b)
- **office:** a service room in the draw loop was killing the frame (df307c9)
- **easel:** size the overflow note to its number (0bd5073)
- **office:** the floor sign's second line was drawn off its plate (bbd115d)
- **easel:** a tall frame no longer hides its top under the header (d9eb989)

### Прочее

- refactor(storage): browser keys drop the AI, like the product (7a3d6cc)
- refactor(ui): four panels share one focus ring (7f516be)
- refactor(layout): service rooms live in rooms, not beside it (a2ef66e)
- Стол закрепляется за сессией и переживает перезапуск (d007573)

## v0.1.0 — 30 августа 2026

Первый закреплённый релиз: 79 коммитов от 25 августа, всё до этой строки.
Пиксельный офис, живые агенты Claude Code, записки на столе и отправка задания
в чат, картины и мольберт, титульный экран, лифт, погода в окне.

Раздел написан руками, а не генератором, и это единственный такой. Префиксы
коммитов введены 29 августа, из 79 коммитов размечены единицы — сборка выдала
бы семьдесят строк «Прочее» вместо описания. Со следующего релиза история
размечена целиком и собирается сама.
