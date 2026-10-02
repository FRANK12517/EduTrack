/* Region/district mappings extracted unchanged from EduTrack_v386.html. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.EDUTRACK_GHANA_HIERARCHY=api;root.GH_REGIONS_DISTRICTS=api.districtsByRegion;}})(typeof window==='object'?window:globalThis,function(){
'use strict';
const districtsByRegion = {
  "Ahafo Region": ["Asunafo North","Asunafo South","Asutifi North","Asutifi South","Tano North","Tano South"],
  "Ashanti Region": ["Kumasi Metro","Oforikrom","Kwadaso","Suame","Tafo","Manhyia North","Manhyia South","Asokwa","Bosomtwe","Ejisu","Juaben","Kwabre East","Afigya Kwabre North","Ahafo Ano North","Ahafo Ano South East","Amansie Central","Amansie South","Amansie West","Asante Akim Central","Asante Akim North","Asante Akim South","Bekwai","Bosome Freho","Ejura Sekyedumase","Mampong","Obuasi Municipal","Obuasi East","Offinso Municipal","Offinso North","Sekyere Afram Plains","Sekyere Central","Sekyere East","Sekyere Kumawu","Sekyere South"],
  "Bono Region": ["Sunyani Municipal","Sunyani West","Berekum East","Berekum West","Dormaa Central","Dormaa East","Dormaa West","Jaman North","Jaman South","Tain","Wenchi Municipal"],
  "Bono East Region": ["Atebubu Amantin","Kintampo North","Kintampo South","Nkoranza North","Nkoranza South","Pru East","Pru West","Sene East","Sene West","Techiman Municipal","Techiman North"],
  "Central Region": ["Cape Coast Metro","Abura Asebu Kwamankese","Agona East","Agona West","Ajumako Enyan Essiam","Asikuma Odoben Brakwa","Assin Central","Assin North","Assin South","Awutu Senya East","Awutu Senya West","Effutu","Ekumfi","Gomoa Central","Gomoa East","Gomoa West","Komenda Edina Eguafo Abirem","Mfantsiman","Twifo Atti Morkwa","Twifo Hemang Lower Denkyira","Upper Denkyira East","Upper Denkyira West"],
  "Eastern Region": ["New Juaben South","New Juaben North","Birim Central","Birim North","Birim South","Denkyembour","East Akim","Fanteakwa North","Fanteakwa South","Kwaebibirem","Kwahu Afram Plains North","Kwahu Afram Plains South","Kwahu East","Kwahu South","Kwahu West","Lower Manya Krobo","Upper Manya Krobo","Upper West Akim","West Akim","Yilo Krobo","Atiwa East","Atiwa West","Asuogyaman","Akuapim North","Akuapim South","Nsawam Adoagyiri"],
  "Greater Accra Region": ["Accra Metro","Tema Metro","Ga East","Ga West","Ga South","Ga North","Ga Central","Ledzokuku","Krowor","Adentan","Ashaiman","Shai Osudoku","Ningo Prampram","Ada East","Ada West","La Nkwantanang Madina","La Dade Kotopon","Ayawaso Central","Ayawaso East","Ayawaso North","Ayawaso West","Okaikwei North","Ablekuma Central","Ablekuma North","Ablekuma West","Korle Klottey","Kpone Katamanso"],
  "North East Region": ["Bunkpurugu Nakpayili","Chereponi","East Mamprusi","Mamprugu Moagduri","Nalerigu Gambaga","West Mamprusi"],
  "Northern Region": ["Tamale Metro","Sagnarigu","Nanton","Savelugu","Tolon","Kumbungu","Nanumba North","Nanumba South","Gushegu","Karaga","Mion","Zabzugu","Tatale Sanguli","Yendi","Bimbilla","Wulensi"],
  "Oti Region": ["Jasikan","Kadjebi","Krachi East","Krachi Nchumuru","Krachi West","Nkwanta North","Nkwanta South","Biakoye"],
  "Savannah Region": ["Bole","Central Gonja","East Gonja","North East Gonja","North Gonja","Sawla Tuna Kalba","West Gonja"],
  "Upper East Region": ["Bolgatanga Municipal","Bawku Municipal","Bawku West","Binduri","Bongo","Builsa North","Builsa South","Garu","Kassena Nankana East","Kassena Nankana West","Nabdam","Pusiga","Talensi","Tempane"],
  "Upper West Region": ["Wa Municipal","Daffiama Bussie Issa","Jirapa","Lambussie Karni","Lawra","Nadowli Kaleo","Nandom","Sissala East","Sissala West","Wa East","Wa West"],
  "Volta Region": ["Ho Municipal","Ho West","Agotime Ziope","Akatsi North","Akatsi South","Anloga","Central Tongu","Hohoe","Keta","Ketu North","Ketu South","Kpando","North Dayi","North Tongu","South Dayi","South Tongu"],
  "Western Region": ["Sekondi Takoradi Metro","Ahanta West","Effia Kwesimintsim","Shama","Wassa East","Wassa Amenfi Central","Wassa Amenfi East","Wassa Amenfi West","Wassa Mpohor","Jomoro","Ellembelle","Nzema East","Prestea Huni Valley","Tarkwa Nsuaem"],
  "Western North Region": ["Bia East","Bia West","Bibiani Anhwiaso Bekwai","Bodi","Juaboso","Sefwi Akontombra","Sefwi Wiawso","Suaman"]
};
Object.values(districtsByRegion).forEach(Object.freeze);Object.freeze(districtsByRegion);
const regions=Object.freeze(Object.keys(districtsByRegion).sort());
function hasRegion(region){return typeof region==='string'&&Object.prototype.hasOwnProperty.call(districtsByRegion,region);}
function districtsFor(region){return hasRegion(region)?districtsByRegion[region].slice().sort():[];}
function validPair(region,district){return hasRegion(region)&&districtsByRegion[region].includes(district);}
function populateRegions(select){select.replaceChildren(new Option('— Select Region —',''));regions.forEach(name=>select.append(new Option(name,name)));}
function cascade(region,district){district.replaceChildren(new Option(region.value?'— Select District —':'— Select Region First —',''));district.disabled=!hasRegion(region.value);districtsFor(region.value).forEach(name=>district.append(new Option(name,name)));}
return Object.freeze({districtsByRegion,regions,hasRegion,districtsFor,validPair,populateRegions,cascade});
});
