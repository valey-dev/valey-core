---
title: The office opens to the network and closes again without a restart
scope: server
---

Letting a phone or another machine reach the office meant stopping it, starting it again with `VALEY_EXTERNAL=1` and carrying a 32-character token from the terminal to the other device by hand. Closing it again was another restart.

Now the running office opens and closes on request: `POST /api/network` with `open`, `close` or `rotate`, owner only. Opening adds a listener on each of the machine's network addresses next to the one on 127.0.0.1, so the owner's own tab never drops; closing takes them away, and a phone holding the old token is turned away the moment it is rotated. The live feed module puts this switch on the key shelf, with a QR code for the phone.

Left out on purpose: reaching the office from the internet — that is still a tunnel, and still the owner's own — and a separate token per device.
