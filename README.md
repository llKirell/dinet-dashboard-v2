# DINET Dashboard Web - Fase 1

Dashboard web en HTML, CSS y JavaScript para visualizar el estatus de picking DINET a partir de una base Excel cargada manualmente.

## Flujo actual

- El dashboard ya no depende de un Excel fijo guardado en `data/`.
- Cada vez que quieras revisar informacion nueva, debes subir una base actualizada.
- La hoja prioritaria sigue siendo `Embarques`; si no existe, se usa la primera hoja del archivo.

## Clasificacion visible

El dashboard ahora solo trabaja con estas categorias:

- `LOCAL`
- `PROVINCIA`

Reglas actuales:

- Si `Tipo_Destino` contiene `Provincia`, se clasifica como `PROVINCIA`.
- Si `Tipo_Destino` contiene `Canal Moderno`, `Canal Tradicional`, `Local` o `Copack`, se clasifica como `LOCAL`.
- Si `Tipo_Destino` viene vacio o con otro texto, el sistema revisa primero el catalogo local en `data/catalogo_clientes.js`.
- Si no encuentra coincidencia en el catalogo, intenta inferir `PROVINCIA` por palabras clave del destino o cliente; si no encuentra evidencia, cae en `LOCAL`.

## Como usarlo

1. Abre `index.html` en tu navegador.
2. Haz clic en `Cargar base Excel`.
3. Selecciona la base actualizada en `.xlsx`, `.xls` o `.csv`.
4. Revisa los tabs `TODOS`, `LOCAL` y `PROVINCIA`.

## Catalogo local opcional

Existe un archivo editable:

- `data/catalogo_clientes.js`

Puedes registrar ahi clientes o destinos para forzar clasificacion:

```js
window.CLIENT_TYPE_CATALOG = {
  codigos: {
    "0010262975": "LOCAL"
  },
  clientes: {
    "AJILES PERU S A C": "LOCAL",
    "CLIENTE X": "PROVINCIA"
  },
  destinos: {
    "PE 13009 TRUJILLO": "PROVINCIA"
  }
};
```

Esto sirve para que, cuando me compartas una base mejor, podamos ir alimentando ese catalogo y mejorar la clasificacion sin reescribir la logica principal.

## Siguiente mejora recomendada

Si luego quieres hacerlo mas preciso, lo ideal es agregar un catalogo editable de clientes o destinos para que la clasificacion no dependa solo del texto que venga en el Excel.
