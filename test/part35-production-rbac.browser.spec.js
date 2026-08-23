'use strict';
const base=process.env.EDUTRACK_PRODUCTION_BASE_URL;
if(!base){console.log(JSON.stringify({status:'NOT_PROVEN',reason:'DEPLOYED RBAC MATRIX UNAVAILABLE',roles:['DEVELOPER_ROOT','SUPER_ADMIN','NATIONAL_ADMIN','REGIONAL_ADMIN','DISTRICT_ADMIN','HEADTEACHER','TEACHER','PARENT','STUDENT'],secretValuesPrinted:false},null,2));process.exit(2)}
console.log(JSON.stringify({status:'NOT_PROVEN',reason:'Role credentials and isolated deployment fixtures must be supplied by the deployment operator',baseUrl:'[configured]',roles:['DEVELOPER_ROOT','SUPER_ADMIN','NATIONAL_ADMIN','REGIONAL_ADMIN','DISTRICT_ADMIN','HEADTEACHER','TEACHER','PARENT','STUDENT'],secretValuesPrinted:false},null,2));process.exit(2);
