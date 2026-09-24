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
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "FiberNetworkStudio.Api.dll"]
