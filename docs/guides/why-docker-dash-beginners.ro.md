# De ce Docker și Docker Dash — pentru începători

**Public țintă:** oricine a auzit de Docker dar n-a apucat să-l folosească.
**Timp de citire:** ~4 minute.

> ⏪ [Înapoi la README](../../README.md) · 🇬🇧 [English version](why-docker-dash-beginners.md)

---

## Ce e Docker, mai exact?

Imaginează-ți că aplicația ta e o **rețetă de gătit**. Codul e rețeta, dar ca să gătești efectiv ai nevoie de bucătărie, ingrediente, cuptor, totul setat exact cum trebuie.

Problema clasică în software se numește **"merge la mine pe calculator"**. Tu ai gătit perfect acasă, dar când dai rețeta la prietenul tău, lui îi iese altfel — pentru că are alt cuptor, altă farfurie, altă oală.

**Docker rezolvă asta** punând rețeta + bucătăria + ingredientele într-o singură cutie sigilată ("container") care merge *identic* oriunde o duci: pe laptopul tău, pe serverul firmei, pe cloud, pe Raspberry Pi-ul din hol.

## De ce e mare lucru

- **Instalezi orice aplicație în 30 secunde** — fără "deschide terminal, instalează Python 3.11 nu 3.12, fă symlink, editează config…"
- **Ștergi tot fără urme** — nu rămân fișiere prin sistem, nu se strică sistemul de operare
- **Două aplicații nu se mai bat pe aceleași resurse** — fiecare în cutia ei
- **Backup și mutare ușoară** — împachetezi cutia, o trimiți pe alt server, merge la fel

## OK, am înțeles Docker. De ce am nevoie de Docker Dash?

Docker se controlează din **terminal cu comenzi text**: `docker run`, `docker ps`, `docker logs`, `docker exec`… Pentru cineva care nu trăiește în terminal, e ca și cum ți-ar cere să programezi cuptorul scriind cod în Morse.

**Docker Dash e panoul de control vizual pentru Docker.** În loc să tastezi:

```bash
docker logs -f --tail 200 my-app | grep ERROR
```

dai click pe container, click pe "Logs", scrii "ERROR" în filtru. Gata.

## Ce vezi în primele 30 secunde după ce-l deschizi

- **Toate aplicațiile** care rulează, cu CPU și RAM live (ca Task Manager)
- **Buton Start / Stop / Restart** pentru fiecare container
- **Logs live**, căutabile, cu butoane de descărcare
- **Statistici de disc** — cine ocupă spațiu și cât
- **Imagini "vechi"** care n-au mai fost folosite de săptămâni — un click și sunt șterse

## De ce Docker Dash și nu altceva?

| | Docker Dash |
|---|---|
| **Gratis, fără limitări** | ✅ Portainer (cea mai populară alternativă) cere $95/an pe server pentru funcții de bază precum login cu Google sau backup |
| **Un singur container** | ✅ instalezi cu o comandă, fără bază de date externă, fără setări complicate |
| **80 MB pe disc, 50 MB de RAM** | ✅ merge până și pe cel mai ieftin VPS sau Raspberry Pi |
| **51 ghiduri pas-cu-pas în română și engleză** | ✅ built-in, nu trebuie să googlești |
| **Nu te leagă de el** | ✅ ștergi Docker Dash → containerele tale rămân acolo, nimic nu se sparge |

## Ce poți face în prima oră

1. Instalezi Docker Dash (2 minute — vezi [Quick Start](../../README.md#quick-start))
2. Vezi tot ce-ți rulează pe server, vizual
3. Pornești o aplicație nouă (Nextcloud, WordPress, Vaultwarden) cu 3 click-uri din șabloanele built-in
4. Setezi backup automat zilnic
5. Activezi 2FA pentru contul tău admin

> **Costul total:** zero. Nu e trial, nu e freemium, nu cere card. Cod sursă deschis, licență MIT.

## Unde mergi mai departe

- 👉 [Quick Start](../../README.md#quick-start) — instalează Docker Dash în 2 minute
- Deschide pagina **Containers** din meniul stâng — vezi ce-ți rulează
- Încearcă **Templates** pentru a porni o aplicație nouă în secunde
- Răsfoiește celelalte How-To Guides din aplicație — sunt 51 în total, de la comenzi Docker de bază până la securitate avansată
- Apasă **Ctrl + K** oriunde în aplicație ca să deschizi paleta de comenzi

---

> Te descurci deja cu git și CI/CD? Probabil vrei direct [Ghidul pentru developeri](why-docker-dash-developers.ro.md) — sare peste basic-uri și intră direct în modelul mental git → Docker și în comparația cu Portainer / Dockge / scripturi bash.
