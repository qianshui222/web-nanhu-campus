export const theme = {
  sky:'#ece5d8', twilight:'#e3b5a1', night:'#263752', cloud:'#afbbbc',
  sunlight:'#fff0d5', indoor:'#ffd39b', shadow:'#928fb6', bounce:'#e4bd8a',
  grass:'#a2b984', slate:'#73888b', deep:'#438f99', shallow:'#8ac1bb',
  pavement:'#c9bda6', trail:'#ded0ad', groundSide:'#758b72'
}
export const qualityProfiles={
  balanced:{dpr:1.25,shadow:1536,closeShadow:1024,waterDetail:.50,blur:0},
  detailed:{dpr:1.65,shadow:2048,closeShadow:2048,waterDetail:1,blur:.32}
}

// Keys are the existing call-site paints; roles are assigned explicitly.
export const surfaces={
  '#8b9d74':['grass',theme.grass,.94], '#6b8373':['terrain-wall',theme.groundSide,.96],
  '#697a78':['road',theme.pavement,.90], '#adad95':['walk',theme.trail,.92],
  '#c1baa1':['plaza','#d9c5a5',.88], '#b8bca9':['curb','#e2d5b9',.91],
  '#968f77':['joints','#ac9e83',.96], '#858c7b':['border','#b4a993',.88],
  '#557f71':['lake-bank','#748f7f',.90], '#a2ae83':['bank-cap','#b0b893',.93],
  '#416e56':['broadleaf','#527a5f',.94], '#6d976b':['rounded-tree','#749963',.93],
  '#8aa27a':['slender-tree','#91a879',.94], '#617c52':['shrub','#78965f',.95],
  '#936a46':['bench','#aa7655',.77], '#465a50':['bench-frame','#4b6361',.69],
  '#4b5d56':['lamp','#667d7a',.68], '#526b62':['lamp-cap','#627a75',.68],
  '#e8debb':['lamp-lens','#f0ddb2',.43], '#6c6651':['trunk','#87705c',.97],
  '#b46e54':['track','#bf795d',.93], '#b87964':['closed','#ba806d',.94]
}
