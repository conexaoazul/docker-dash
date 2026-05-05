---
title: GPU passthrough către containere Docker (NVIDIA)
summary: Majoritatea workload-urilor AI au nevoie de accelerare GPU pentru a fi utilizabile. Acest ghid instalează nvidia-container-toolkit, verifică că host-ul poate da GPU-ul la Docker, și arată sintaxa compose pentru acces GPU.
---

<h2>Prerechizite</h2>
<ul>
  <li>GPU NVIDIA pe host (confirmă: <code>nvidia-smi</code> funcționează pe host)</li>
  <li>Driver NVIDIA instalat (driver ≥ 550 pentru CUDA 12.4)</li>
  <li>Docker Engine ≥ 19.03 pe host</li>
</ul>

<h2>Pasul 1: Instalează nvidia-container-toolkit</h2>
<p>Pachetul învață Docker cum să expună GPU-ul către containere via flag-ul <code>--gpus</code>.</p>

<h3>Ubuntu/Debian</h3>
<pre><code>curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h2>Pasul 2: Test rapid</h2>
<pre><code>docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi</code></pre>

<h2>Pasul 3: Folosește-l în compose</h2>
<pre><code>services:
  my-ai-service:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]</code></pre>

<h2>Pasul 4: Verifică că containerul vede GPU-ul</h2>
<pre><code>docker exec my-ai-service nvidia-smi</code></pre>
<p>Workload-urile AI (Ollama, vLLM, Stable Diffusion, ComfyUI) detectează GPU-ul automat odată ce e disponibil în container.</p>

<h2>Multi-GPU</h2>
<p>Pin-uirea GPU-urilor specifice la containere previne competiția pentru aceeași memorie VRAM:</p>
<pre><code>            - driver: nvidia
              device_ids: ["0"]
              capabilities: [gpu]</code></pre>

<h2>GPU AMD</h2>
<p>GPU-urile AMD au nevoie de <a href="https://rocm.docs.amd.com/en/latest/install/docker.html" target="_blank">support ROCm</a> configurat separat. Sintaxa compose diferă. Majoritatea template-urilor AI care zic "GPU required" se referă la NVIDIA.</p>
