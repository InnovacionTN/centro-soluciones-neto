Documento de Especificación de Diseño: Centro de Soluciones Neto (CSN)1. Fundamentos de MarcaNombre del Sistema: Centro de Soluciones Neto (CSN)Propósito: Gestión de tickets TI y servicios internos.Tipografía Principal: Montserrat (Sans-serif).2. Paleta de Colores (Variables SCSS)Copia y pega este bloque en tu archivo _variables.scss:SCSS// Colores Corporativos
$color-primary-orange: #FF5100; // Pantone Orange 021 C
$color-primary-blue:   #0E3B83; // Pantone 7687 CP
$color-accent-cyan:    #1ABC9C; // Cian de Acento ajustado

// Escala de Grises (10% - 90%)
$gray-10: #FAFAFB; // Fondo muy claro
$gray-20: #F3F4F6; // Fondo claro / Hover
$gray-30: #E0E0E0; // Bordes y divisiones
$gray-50: #AAAAAA; // Texto secundario / Placeholders
$gray-60: #9D9D9C; // Gris Principal Pantone
$gray-90: #343434; // Texto principal / Títulos

// Colores Semánticos (UI States)
$color-success: #27AE60; // Verde éxito
$color-alert:   #E74C3C; // Rojo error/urgente
$color-info:    #3498DB; // Azul información
$color-surface: #FFFFFF; // Blanco puro
$color-dark-bg: #1E293B; // Fondo para paneles oscuros
3. Tipografía (Montserrat)ElementoPeso (Weight)Tamaño (Size)Línea (Line-height)H1 (Títulos Principales)Bold (700)32px40pxH2 (Títulos Secciones)Bold (700)24px32pxH3 (Subtítulos/Cards)Medium (500)18px26pxCuerpo de TextoRegular (400)14px22pxBotones y UISemi-Bold (600)16px24pxLabels FormularioMedium (500)13px18px4. Componentes de Interfaz (UI)BotonesPrimario: Fondo $color-primary-blue, texto $color-surface. Border-radius: 6px.Acción (Cian): Fondo $color-accent-cyan, texto $color-surface.Hover State: Oscurecer el color de fondo un 10% y añadir un box-shadow suave.Formularios (Inputs)Borde: 1px solid $gray-30.Focus State: Borde $color-primary-blue con un resplandor de 3px rgba(14, 59, 131, 0.2).Padding: 10px 15px.Radio de borde: 4px.Bordes y SombrasCards: background: $color-surface, border: 1px solid $gray-20, box-shadow: 0 4px 6px rgba(0,0,0,0.05).Separadores: 1px solid $gray-30.5. Estructura de Logo (Layout)Logotipo Principal: Texto "CSN" en $color-primary-blue con flecha en $color-primary-orange. Debajo, texto "Centro de Soluciones Neto" en $gray-90.Favicon/Icono: Solo las letras "CSN" inscritas en un círculo o espacio limpio.Uso en fondo oscuro: El texto "CSN" debe cambiar a $color-surface, manteniendo la flecha naranja.Ejemplo de Mixin SCSS para Claude:SCSS@mixin button-primary {
  background-color: $color-primary-blue;
  color: $color-surface;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  border-radius: 6px;
  padding: 12px 24px;
  border: none;
  transition: background 0.3s ease;
  
  &:hover {
    background-color: darken($color-primary-blue, 10%);
    cursor: pointer;
  }
}
¿Te gustaría que redacte también el código HTML base para la estructura del Dashboard del portal?
