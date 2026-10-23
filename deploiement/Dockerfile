# Image de l'outil : Node 24 natif, aucune dépendance, utilisateur non privilégié.
FROM node:24-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
USER node
EXPOSE 8710
CMD ["node", "serveur/demarrer.mjs"]
