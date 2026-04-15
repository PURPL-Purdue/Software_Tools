# Grafana Timechart Plugin

## Table of Contents

- [Grafana Timechart Plugin](#grafana-timechart-plugin)
  - [Table of Contents](#table-of-contents)
  - [Description](#description)
  - [Pre-Requisites](#pre-requisites)
    - [1. WSL](#1-wsl)
      - [Steps](#steps)
    - [2. Docker Desktop](#2-docker-desktop)
      - [Steps](#steps-1)
  - [Development \& Deployment Overview](#development--deployment-overview)
  - [Setup](#setup)
    - [One-Time Setup](#one-time-setup)
    - [Plugin](#plugin)
      - [Plugin Password](#plugin-password)
      - [Saving Edits](#saving-edits)
    - [Deployment](#deployment)
      - [Deployment Password](#deployment-password)
      - [Saving Edits](#saving-edits-1)
  - [Common Problems](#common-problems)

## Description

This is the full enclosure for all things involving the custom Grafana panel instance for the visual timechart. This leverages Grafana to create a visualization through React that process our information and returns interactable visualizations of test data. There is a [<u>plugin</u>](#plugin) portion that handles editing and changing the panel's visuals/implementation and a [<u>deployment</u>](#deployment) portion that handles using and displaying the panel for live server test data.

## Pre-Requisites 

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

## Development & Deployment Overview

There are two different portions of this folder:

1. Plugin
- This piece includes the __solo/offline__ dev piece that can instantly reload the panel, use temporary test data, and allow a quicker devlopment of panel changes

2. Deployment
- This piece includes the __deployment/actual use__ of the panel in getting information. This piece can actually make connections to data signals, such as server databases, and collect that information to display in the chart

## Setup

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

## Common Problems

- If when using `npm run dev` you see errors with your webpack, use `npm install` to fix the problem. Yes, the `npm install` command does take a **LONG** time, but I promise it is working