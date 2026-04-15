# Grafana Panel Deployment

This holds the local Grafana code for deployment-ready usage.

## Table of Contents

- [Grafana Panel Deployment](#grafana-panel-deployment)
  - [Table of Contents](#table-of-contents)
  - [What is this used for?](#what-is-this-used-for)
  - [Pre-Requisites](#pre-requisites)
    - [1. WSL](#1-wsl)
      - [Steps](#steps)
    - [2. Docker Desktop](#2-docker-desktop)
      - [Steps](#steps-1)
  - [Setup](#setup)
    - [One-Time Setup](#one-time-setup)
    - [Deployment](#deployment)
      - [Deployment Password](#deployment-password)
      - [Saving Edits](#saving-edits)
  - [Folder Contents](#folder-contents)
    - [**dashboards**](#dashboards)
    - [**docker-compose.yaml**](#docker-composeyaml)
    - [**provisioning**](#provisioning)

## What is this used for?

This portion of the repository is used specifically to run a version of grafana that can connect to external data sources (the server, for example) and connect that data to the panel plugin for display.

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

### Deployment

In order to run the **Full Deployment** instance of grafana to access server data and read it on the panel, you must work in the plugin piece:

>**NOTE**: You must run `npm run dev` or `npm run build` in the plugin folderspace before being able to use the deployment panel.

```bash
cd ~/Software_Tools/SPYGLASS/Grafana_Plugin/deployment
docker compose up
```

You may then interface with the grafana instance through **http://localhost:3000/**

#### Deployment Password

Initially, username = admin password = admin.
After that, change the password to something different. For parity's sake, just use "purpl".

#### Saving Edits

After making any changes to the development dashboard, it will not automatically save to files and be uploadable to Github. In order to save your changes properly, you must:
  1. If you are currently editing the dashboard, select the "Exit Edit" option on the whole dashboard
  2. Select "Export", then "Export as Code"
  3. You then have two different options:
     1. Export
        1. Select "Download File" to download it as a separate file
        2. Replace the file in `./deployment/dashboards/deployment-dashboard.json` with the downloaded file
     2. Copy & Paste
        1. Select "Copy to Clipboard" to copy the whole file contents
        2. Replace the file contents in `./deployment/dashboards/deployment-dashboard.json` with your clipboard content

## Folder Contents

Here we will explain what each folder contains and what each file does. In each section there is an **<u>Importance</u>** modifier that represents how often this folder is accessed or used.

### **dashboards**

This holds the .json version of the grafana dashboard that is used. Grafana Dashboards essentially hold a bunch of different visualizations (with the panel plugin being one such visualization). Making any changes to the Deployment dashboards will be made here, and this is the filepath specifically when it comes to [saving edits](#saving-edits).

**<u>Importance: High</u>**

### **docker-compose.yaml**

This is the docker composition that creates the grafana container instance, sets the volume files, and chooses the port to run on. This is useful to get a better understanding of the docker container, what port to open via `localhost:####`, and where to find folders inside the docker filesystem.

**<u>Importance: Moderate</u>**

### **provisioning**

Like [dashboards](#dashboards), this holds more info about grafana dashboards, specifically any dashboard filepaths and update intervals.

**<u>Importance: Minimal</u>**
