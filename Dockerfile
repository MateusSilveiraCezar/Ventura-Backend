# Usar uma imagem base oficial do Node.js
FROM node:22

# Definir o diretório de trabalho no container
WORKDIR /app

# Copiar o package.json e package-lock.json (ou yarn.lock)
COPY package*.json ./

# Instalar as dependências
RUN npm install

# Copiar todo o código da aplicação para dentro do container
COPY . .

# Expor a porta 3000 (ou a porta que sua aplicação usa)
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"]
