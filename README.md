# Planora — Appointment Planner

A refreshed, responsive appointment planner built with React. It includes a dashboard, quick filters, priority labels, appointment completion, archive and restore actions, and backup/export tools.

## Features

- Dashboard cards for active, upcoming, completed, and high-priority appointments.
- Create and edit appointments with date, time, description, location or meeting link, and priority.
- Search across titles, notes, and locations; filter by view, date, and priority.
- Sort by soonest, latest, or priority.
- Mark appointments as completed, archive them, or restore them from the archive.
- Automatically saves data in the browser using `localStorage`.
- Export a spreadsheet-friendly CSV or a restorable JSON backup; import a JSON backup to restore data.
- Responsive layout for desktop, tablet, and mobile.
- GitHub Actions workflow that builds and publishes the static frontend to GitHub Pages.

## Important data note

The GitHub Pages version is a **static, single-browser app**. Your appointments are stored in that browser on that device. They are not synced between devices, shared between users, or stored in a cloud database. Clearing browser data can remove them, so download a JSON backup periodically.

The original ASP.NET Core API and SQL Server project are retained in this repository, but this static GitHub Pages frontend does not call that API. GitHub Pages cannot run the ASP.NET backend. For multi-device sync, authentication, or shared data, deploy the API and database to a separate backend host and reconnect the frontend to it.

## Run locally

Requirements: Node.js 20+ (Node.js 22 recommended).

```bash
cd AppointmentsManager/ClientApp
npm ci
npm start
```

To build the production frontend:

```bash
cd AppointmentsManager/ClientApp
npm ci
npm run build
```

The generated static site is written to `AppointmentsManager/ClientApp/build`.

## Publish on GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push a commit to `main` or manually run the **Deploy appointment planner to GitHub Pages** workflow from the **Actions** tab.
5. After the workflow succeeds, open the Pages URL shown in the workflow or repository settings.

The included `.github/workflows/deploy.yml` installs dependencies, builds the React app, and publishes the build folder automatically on each push to `main`.

## Data backup format

- **CSV export:** for opening, filtering, or analysing appointment details in Excel.
- **JSON backup:** preserves appointment fields and can be imported back into this app. Import replaces the appointment list currently saved in that browser.

## Project layout

```text
.github/workflows/deploy.yml      # GitHub Pages deployment
AppointmentsManager/ClientApp/    # React frontend deployed to Pages
AppointmentsManager/              # Original ASP.NET Core API project
img/                              # Original screenshots
```
