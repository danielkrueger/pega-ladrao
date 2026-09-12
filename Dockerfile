FROM node:20-alpine

WORKDIR /app

# Instalar dependências de produção
COPY package*.json ./
RUN npm install --omit=dev

# Copiar arquivos do projeto
COPY . .

# Variáveis padrão de ambiente
ENV PORT=3005
ENV NODE_ENV=production

# Porta da aplicação
EXPOSE 3005

# Comando de inicialização
CMD ["npm", "start"]
