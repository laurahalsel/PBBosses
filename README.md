# Pickleball Boss Ladies

This folder is a static web app. To access it anywhere, publish the whole `PBBosses` folder to Netlify.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase-schema.sql`.
4. Copy your project URL and anon public key.
5. Paste them into `config.js`.

After this, all organizers who open the Netlify site will use the same shared roster and Wednesday attendance.

## Netlify setup

1. Drag the `PBBosses` folder into Netlify deploys, or connect it as a site.
2. The publish directory is this folder.
3. Rename the Netlify site to `PBBosses` if that name is available.
