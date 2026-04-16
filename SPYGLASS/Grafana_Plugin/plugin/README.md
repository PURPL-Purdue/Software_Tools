# Grafana Panel Plugin Development

This holds the whole Grafana panel React code.

## Table of Contents

- [Grafana Panel Plugin Development](#grafana-panel-plugin-development)
  - [Table of Contents](#table-of-contents)
  - [What are Grafana panel plugins?](#what-are-grafana-panel-plugins)
  - [Pre-Requisites](#pre-requisites)
    - [1. WSL](#1-wsl)
      - [Steps](#steps)
    - [2. Docker Desktop](#2-docker-desktop)
      - [Steps](#steps-1)
  - [Setup](#setup)
    - [One-Time Setup](#one-time-setup)
    - [Plugin](#plugin)
      - [Plugin Password](#plugin-password)
      - [Saving Edits](#saving-edits)
  - [Folder Contents](#folder-contents)
    - [**src**](#src)
    - [**dashboards**](#dashboards)
    - [**docker-compose.yaml**](#docker-composeyaml)
    - [**.config/**](#config)
    - [**dist**](#dist)
    - [**node\_modules**](#node_modules)
    - [**provisioning**](#provisioning)

## What are Grafana panel plugins?

Panel plugins allow you to add new types of visualizations to your dashboard, such as maps, clocks, pie charts, lists, and more.

In our case, our panel plugin is a multi-axes chart used to display the test data, fit with options to alter the number of axes, toggle data lines on or off, export or import data and visualization options, etc.

## Pre-Requisites 

>**NOTE:** This is the same process that the `../README.md` describes.

>**Please note that all instructions are completed using a Windows computer. Mac is possible but must use a different Linux approach.**

### 1. WSL

This is the Windows Subsystem for Linux (WSL) and what will be used for the operating system.

#### Steps

1. Navigate to https://learn.microsoft.com/en-us/windows/wsl/install
2. Follow the steps to install and create a username/password

>**NOTE:** In order to clone your repository in the windows subsystem, you can type in `\\wsl$` in the File Explorer filepath (Windows only), navigate to your Ubuntu distro (NOT the docker-desktop folder), navigate to home, then to your username made when creating your WSL. <u>Essentially, the filepath to clone the repository on Windows is `\\wsl$/Ubuntu/home/YOUR-USERNAME`</u>. Your `Ubuntu` folder may have a different name, like `Ubuntu-22.04`, for example. Just don't choose the docker-desktop one.

### 2. Docker Desktop

This will encapsulate all parts of the processes in their own "containers" or sandboxes that isolate version types and storage into their own trackable boxes. In the case of making a bunch of different processes (ex. a deployment Grafana site and a plugin development Grafana site) it will keep them in their own divided spaces to be turned on or off at will.

#### Steps

1. Navigate to https://www.docker.com/products/docker-desktop/
2. Follow the steps to installation, choosing your own computer type appropriate

>**NOTE:** In order for the WSL code to use and recognize your Docker Desktop to create containers, the application must be open during runtime.

## Setup

>**NOTE:** This is the same process that the `../README.md` describes.

### One-Time Setup

In order to install npm and dependencies, this must be ran once after cloning the repo:

```bash
cd ~/Software_Tools/SPYGLASS/Grafana_Plugin/plugin
npm install
```

### Plugin

In order to run the __Testing Development__ instance of grafana to edit the panel, you must work in the plugin piece:

```bash
cd ~/Software_Tools/SPYGLASS/Grafana_Plugin/plugin
npm run dev
```

Then, in another console:

```bash
cd ~/Software_Tools/SPYGLASS/Grafana_Plugin/plugin
docker compose up
```

You may then interface with the development grafana instance through **http://localhost:3001/**

#### Plugin Password

Initially, username = admin password = admin.
After that, change the password to something different. For parity's sake, just use "purpl".

#### Saving Edits

After making any changes to the plugin dashboard, it will not automatically save to files and be uploadable to Github. In order to save your changes properly, you must:
  1. If you are currently editing the dashboard, select the "Exit Edit" option on the whole dashboard
  2. Select "Export", then "Export as Code"
  3. You then have two different options:
     1. Export
        1. Select "Download File" to download it as a separate file
        2. Replace the file in `./plugin/dashboards/dashboard.json` with the downloaded file
     2. Copy & Paste
        1. Select "Copy to Clipboard" to copy the whole file contents
        2. Replace the file contents in `./plugin/dashboards/dashboard.json` with your clipboard content

## Folder Contents

Here we will explain what each folder contains and what each file does. In each section there is an **<u>Importance</u>** modifier that represents how often this folder is accessed or used.

### **src**

This holds the actual React component for the panel plugin, including any images used or extra info necessary for TypeScript to be happy. The primary component code lies within `src/components/SimplePanel.tsx`.

**<u>Importance: High</u>**

### **dashboards**

This holds the .json version of the grafana dashboard that is used. Grafana Dashboards essentially hold a bunch of different visualizations (with the panel plugin being one such visualization). Making any changes to the Plugin dashboards will be made here.

**<u>Importance: Moderate</u>**

### **docker-compose.yaml**

This is the docker composition that creates the grafana container instance, sets the volume files, and chooses the port to run on. This is useful to get a better understanding of the docker container, what port to open via `localhost:####`, and where to find folders inside the docker filesystem.

**<u>Importance: Moderate</u>**

### **.config/**

This holds a lot of version info and data for what is being used or ran and any specification configurations to the modules that must be done.

**<u>Importance: Minimal</u>**

### **dist**

This is build information made every time `npm run build` is executed.

**<u>Importance: Minimal</u>**

### **node_modules**

This is a HUGE list of ever single node module downloaded from `npm install`.

**<u>Importance: Minimal</u>**

### **provisioning**

Like [dashboards](#dashboards), this holds more info about grafana dashboards, specifically any test datasources, dashboard filepaths and update intervals.

**<u>Importance: Minimal</u>**
