'use strict';
const ACC = { ice: ['#3BE3FF', '#0B5370'], toxic: ['#B6FF3B', '#3E6B00'], violet: ['#B46BFF', '#4A1A8C'], blood: ['#FF3B3B', '#7A0E0E'], gold: ['#FFC233', '#7A4E00'] };
const a = ACC[new URLSearchParams(location.search).get('accent')] || ACC.ice;
document.documentElement.style.setProperty('--accent', a[0]);
document.documentElement.style.setProperty('--accent-d', a[1]);
document.getElementById('logo').innerHTML = window.reaperSvg({ text: true });
