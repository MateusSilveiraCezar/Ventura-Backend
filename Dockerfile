# Usar uma imagem base oficial do Node.js
FROM node:22

# Definir o diretório de trabalho no container
WORKDIR /app

# Copiar o package.json e package-lock.json (ou yarn.lock)
COPY package*.json ./

# Instalar as dependências
RUN npm install

# Copiar os arquivos da aplicação para dentro do container
COPY . .

# Compilar os arquivos TypeScript para JavaScript
RUN npm run build  # Gera a pasta dist/ com o arquivo compilado

# Expor a porta que a aplicação vai rodar
EXPOSE 3000

# Rodar a aplicação a partir do arquivo compilado em dist/
CMD ["node", "dist/server.js"] 
