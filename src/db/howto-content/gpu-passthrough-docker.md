---
title: GPU passthrough to Docker containers (NVIDIA)
summary: Most AI workloads need GPU acceleration to be usable. This guide installs nvidia-container-toolkit, verifies the host can hand a GPU to Docker, and shows the compose syntax for GPU access.
category: ai
difficulty: intermediate
icon: fas fa-microchip
---

<h2>Prerequisites</h2>
<ul>
  <li>NVIDIA GPU on the host (confirm: <code>nvidia-smi</code> works on host)</li>
  <li>NVIDIA driver installed and matching CUDA version requirements (driver ≥ 550 for CUDA 12.4)</li>
  <li>Docker Engine ≥ 19.03 on the host</li>
</ul>

<h2>Step 1: Install nvidia-container-toolkit</h2>
<p>This package teaches Docker how to expose the GPU to containers via the <code>--gpus</code> flag.</p>

<h3>Ubuntu/Debian</h3>
<pre><code># Add the NVIDIA repo
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use it
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h3>RHEL/Fedora/Rocky</h3>
<pre><code>curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
  | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
sudo dnf install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h2>Step 2: Smoke test</h2>
<pre><code>docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi</code></pre>
<p>If you see your GPU listed (memory, driver version, processes), you're done. If it errors, the most common culprits:</p>
<ul>
  <li><strong>"could not select device driver "" with capabilities: [[gpu]]"</strong> — the toolkit isn't configured. Re-run <code>nvidia-ctk runtime configure</code>.</li>
  <li><strong>"unknown runtime: nvidia"</strong> — old install method. Use <code>--gpus all</code>, NOT <code>--runtime=nvidia</code>.</li>
  <li><strong>Driver/CUDA mismatch</strong> — host driver too old for the CUDA image. Use a base image matching your driver: <code>nvidia/cuda:11.8.0-base-ubuntu22.04</code> for older drivers.</li>
</ul>

<h2>Step 3: Use it in compose</h2>
<p>The Docker Dash AI templates ship with the GPU block commented out. Uncomment it for any AI workload:</p>
<pre><code>services:
  my-ai-service:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all          # or 1 for a specific count
              capabilities: [gpu]</code></pre>
<p>For multiple GPUs, you can also use:</p>
<pre><code>            - driver: nvidia
              device_ids: ["0", "1"]    # specific GPU indexes
              capabilities: [gpu]</code></pre>

<h2>Step 4: Verify the container sees the GPU</h2>
<pre><code>docker exec my-ai-service nvidia-smi</code></pre>
<p>If you see the GPU listed inside the container, you're done. The AI workload will pick it up automatically (Ollama, vLLM, Stable Diffusion, ComfyUI all auto-detect).</p>

<h2>Multi-GPU + multi-tenant</h2>
<p>Pinning specific GPUs to specific containers prevents two heavy workloads from contending for the same VRAM:</p>
<pre><code>services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["0"]
              capabilities: [gpu]

  stable-diffusion:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["1"]
              capabilities: [gpu]</code></pre>

<h2>AMD GPU</h2>
<p>AMD GPUs need <a href="https://rocm.docs.amd.com/en/latest/install/docker.html" target="_blank">ROCm Docker support</a>, configured separately. The compose syntax differs (use <code>devices: [/dev/kfd, /dev/dri]</code>). Most AI templates that say "GPU required" mean NVIDIA — verify ROCm support per project before deploying.</p>
