# Configuración de GitHub Secrets para CI/CD

## Secrets Requeridos

Configurar en: **GitHub Repo > Settings > Secrets and variables > Actions**

### 1. CLOUDFLARE_API_TOKEN

Crear token en: https://dash.cloudflare.com/profile/api-tokens

**Permisos requeridos:**
- Account > Cloudflare Workers > Edit
- Account > Workers KV Storage > Edit

```
Ejemplo: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. CLOUDFLARE_ACCOUNT_ID

Tu Account ID de Cloudflare:

```
6334cd7d9eb75b91d4ddcbaf5a3b7466
```

### 3. API_SECRET

El mismo API_SECRET configurado en Cloudflare Workers:

```
(ver en Cloudflare Dashboard > Workers > sara-backend > Settings > Variables)
```

## Verificar Configuración

Después de configurar los secrets, haz un push a main para probar el pipeline:

```bash
git commit --allow-empty -m "Test CI/CD pipeline"
git push
```

Verifica el resultado en: **GitHub Repo > Actions**

## Troubleshooting

### Error: "Authentication error"
- Verifica que CLOUDFLARE_API_TOKEN tenga los permisos correctos
- Regenera el token si es necesario

### Error: "Account not found"
- Verifica CLOUDFLARE_ACCOUNT_ID

### Smoke tests fallan
- Verifica que API_SECRET sea correcto
- Verifica que la URL del worker sea correcta en el workflow
