FROM node:24-alpine AS frontend-build
WORKDIR /src/frontend
RUN npm install --global pnpm@11.19.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY backend/FiberNetworkStudio.Api/FiberNetworkStudio.Api.csproj backend/FiberNetworkStudio.Api/
RUN dotnet restore backend/FiberNetworkStudio.Api/FiberNetworkStudio.Api.csproj
COPY backend/ backend/
COPY --from=frontend-build /src/frontend/dist/ backend/FiberNetworkStudio.Api/wwwroot/
RUN dotnet publish backend/FiberNetworkStudio.Api/FiberNetworkStudio.Api.csproj -c Release -o /out --no-restore -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api-build /out/ ./
COPY demo/data/ /app/Demo_Data/
COPY docker/demo-entrypoint.sh /app/demo-entrypoint.sh
RUN mkdir -p /app/App_Data && chown -R $APP_UID:$APP_UID /app/App_Data
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["sh", "/app/demo-entrypoint.sh"]
