# WILL.AI Backend — Setup

Le backend parle à ton Sheet ORGANISATION et ton Google Calendar. Il faut le configurer une fois, puis c'est bon.

## 1. Créer une Google Cloud Project

1. Va sur https://console.cloud.google.com/
2. Crée un nouveau project : "will-ai"
3. Dans le menu, va à **APIs & Services** → **Library**
4. Cherche et active :
   - **Google Sheets API**
   - **Google Calendar API**

## 2. Créer une Service Account

1. Va à **APIs & Services** → **Credentials**
2. Clique **Create Credentials** → **Service Account**
3. Remplis les infos (ex: `will-ai-service`)
4. Finish
5. Clique sur le service account qu'on vient de créer
6. Va à l'onglet **Keys**
7. **Add Key** → **Create new key** → **JSON**
8. Télécharge le fichier JSON (c'est tes credentials)

## 3. Donner accès au Sheet

1. Ouvre le fichier JSON téléchargé, cherche l'email (ressemble à `xxx@xxx.iam.gserviceaccount.com`)
2. Partage ton Sheet ORGANISATION avec cet email (edit access)

## 4. Configurer le serveur

Copie les credentials JSON dans ton terminal :

```bash
export GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"...","...}'
export SHEET_ID="11VvZeJyN9Spw5SbYTtDXozKerKOZW0gzT-qF7juFZOY"
```

(remplace `GOOGLE_CREDENTIALS` par tout le contenu du JSON en une seule ligne)

## 5. Lancer le serveur

```bash
npm install
npm start
```

Le serveur tourne sur `http://localhost:3000`.

Teste : `curl http://localhost:3000/health`

## 6. Déployer (optionnel)

Pour Vercel :

```bash
npm install -g vercel
vercel
```

Ajoute les env vars dans Vercel (Settings → Environment Variables).

---

## API Endpoints

### Tasks

- `GET /tasks` — récupère toutes les tâches du Sheet
- `POST /tasks` — ajoute une tâche
- `PUT /tasks/:id` — met à jour une tâche
- `DELETE /tasks/:id` — supprime une tâche

### Calendar

- `GET /calendar/events` — événements d'aujourd'hui
- `POST /calendar/events` — crée un événement
- `DELETE /calendar/events/:id` — supprime un événement

### Health

- `GET /health` — status du serveur
