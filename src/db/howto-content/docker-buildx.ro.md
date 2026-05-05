---
title: Imagini Docker multi-arhitectură
summary: Folosește Docker Buildx pentru a construi imagini pentru ARM64, AMD64 și alte arhitecturi.
---

<h2>Construirea imaginilor multi-arhitectură cu Buildx</h2>
<p>Docker Buildx extinde comanda standard <code>docker build</code> cu suport pentru construirea imaginilor pentru mai multe arhitecturi CPU simultan — esențial pentru suportul serverelor x86 și dispozitivelor ARM (Raspberry Pi, Apple Silicon).</p>

<h3>Configurează un builder Buildx</h3>
<pre><code># Creează și folosește o nouă instanță builder
docker buildx create --name mybuilder --use

# Verifică că emulatorii QEMU sunt disponibili
docker run --privileged --rm tonistiigi/binfmt --install all

# Inspectează builder-ul
docker buildx inspect --bootstrap</code></pre>

<h3>Construiește pentru mai multe platforme</h3>
<pre><code>docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t myrepo/myapp:latest \
  --push \
  .</code></pre>
<p>Flag-ul <code>--push</code> este necesar pentru build-uri multi-platformă — rezultatul este o listă de manifest-uri pe care Docker o rezolvă automat la arhitectura corectă.</p>

<h3>Build pentru o singură platformă local</h3>
<pre><code>docker buildx build --platform linux/arm64 -t myapp:arm64 --load .</code></pre>

<h3>Verifică arhitectura imaginii</h3>
<pre><code>docker manifest inspect myrepo/myapp:latest | grep architecture</code></pre>

<h3>Emulare QEMU vs. builder-e native</h3>
<p>Emularea QEMU este convenabilă, dar lentă. Pentru pipeline-urile CI, consideră noduri builder ARM native pentru build-uri mai rapide. GitHub Actions oferă runner-e ARM găzduite.</p>
