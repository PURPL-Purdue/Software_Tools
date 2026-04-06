# Grafana Timechart Plugin

## Description

This is the full enclosure for all things involving the custom grafana panel instance for the visual timechart.

## Pieces

There are two different portions of this folder:

1. Plugin
- This piece includes the __solo/offline__ dev piece that can instantly reload the panel, use temporary test data, and allow a quicker devlopment of panel changes

2. Deployment
- This piece includes the __deployment/actual use__ of the panel in getting information. This piece can actually make connections to data signals, such as server databases, and collect that information to display in the chart

## Setup

### One-Time Setup
In order to install npm and dependencies, this must be ran once after cloning the repo:

`
cd ./Grafana_Plugin/plugin
npm install
`

### Plugin
In order to run the __Testing Development__ instance of grafana to edit the panel, you must work in the plugin piece:

`
cd ./Grafana_Plugin/plugin
npm run dev
`
Then, in another console:
`
cd ./Grafana_Plugin/plugin
docker compose up
`

You may then interface with the grafana instance through http://localhost:3001/

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


#### Plugin Password
Initially, username = admin password = admin.
After that, change the password to something different. For parity's sake, just use "purpl".

### Development
In order to run the __Full Deployment__ instance of grafana to access server data and read it on the panel, you must work in the plugin piece:

**NOTE**: You must run `npm run dev` or `npm run build` in the plugin folderspace before being able to use the panel.

`
cd ./Grafana_Plugin/deployment
docker compose up
`

You may then interface with the grafana instance through http://localhost:3000/

#### Development Password
Initially, username = admin password = admin.
After that, change the password to something different. For parity's sake, just use "purpl".

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