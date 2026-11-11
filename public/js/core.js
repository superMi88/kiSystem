
// Global Core Utilities
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

function getLocalDateString(d = new Date()) {
    if (!(d instanceof Date) || isNaN(d.getTime())) {
        d = new Date();
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
window.getLocalDateString = getLocalDateString;

function getApiUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    if (window.location && window.location.protocol && window.location.protocol.startsWith('http') && !window.Capacitor) {
        return cleanPath;
    }
    if (window.Capacitor || (window.location && (window.location.protocol === 'file:' || window.location.origin === 'null'))) {
        const baseUrl = (typeof getServerUrl === 'function' ? getServerUrl() : (window.ENV_CONFIG && window.ENV_CONFIG.MOBILE_SERVER_URL) || '').replace(/\/+$/, '');
        return baseUrl + cleanPath;
    }
    return cleanPath;
}
window.getApiUrl = getApiUrl;

// Primary DOM References
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const statusEl = document.getElementById('status');
const notificationBar = document.getElementById('notification-bar');
const notificationText = document.getElementById('notification-text');
const notificationAction = document.getElementById('notification-action');
const topWidgetsContainer = document.getElementById('top-widgets-container');
const plusBtn = document.getElementById('plus-btn');
const fileInput = document.getElementById('file-input');

// --- Google Material Icons & SVG System ---
const GOOGLE_ICONS = {
    add: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
    bedtime: "M484-80q-84 0-157.5-32t-128-86.5Q144-253 112-326.5T80-484q0-146 93-257.5T410-880q-18 99 11 193.5T521-521q71 71 165.5 100T880-410q-26 144-138 237T484-80Zm0-80q88 0 163-44t118-121q-86-8-163-43.5T464-465q-61-61-97-138t-43-163q-77 43-120.5 118.5T160-484q0 135 94.5 229.5T484-160Zm-20-305Z",
    bookmarks: "M160-80v-560q0-33 23.5-56.5T240-720h320q33 0 56.5 23.5T640-640v560L400-200 160-80Zm80-121 160-86 160 86v-439H240v439Zm480-39v-560H280v-80h440q33 0 56.5 23.5T800-800v560h-80ZM240-640h320-320Z",
    calendar_add_on: "M680-80v-120H560v-80h120v-120h80v120h120v80H760v120h-80Zm-480-80q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h40v-80h80v80h240v-80h80v80h40q33 0 56.5 23.5T760-720v244q-20-3-40-3t-40 3v-84H200v320h280q0 20 3 40t11 40H200Zm0-480h480v-80H200v80Zm0 0v-80 80Z",
    calendar: "M680-80v-120H560v-80h120v-120h80v120h120v80H760v120h-80Zm-480-80q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h40v-80h80v80h240v-80h80v80h40q33 0 56.5 23.5T760-720v244q-20-3-40-3t-40 3v-84H200v320h280q0 20 3 40t11 40H200Zm0-480h480v-80H200v80Zm0 0v-80 80Z",
    chat: "M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z",
    check: "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
    clear_day: "M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm113-170q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Zm283-57q47-47 47-113t-47-113q-47-47-113-47t-113 47q-47 47-47 113t47 113q47 47 113 47t113-47ZM480-480Z",
    close: "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
    coffee: "M440-240q-117 0-198.5-81.5T160-520v-240q0-33 23.5-56.5T240-840h500q58 0 99 41t41 99q0 58-41 99t-99 41h-20v40q0 117-81.5 198.5T440-240ZM240-640h400v-120H240v120Zm200 320q83 0 141.5-58.5T640-520v-40H240v40q0 83 58.5 141.5T440-320Zm280-320h20q25 0 42.5-17.5T800-700q0-25-17.5-42.5T740-760h-20v120ZM160-120v-80h640v80H160Zm280-440Z",
    directions_bike: "M200-80q-83 0-141.5-58.5T0-280q0-83 58.5-141.5T200-480q83 0 141.5 58.5T400-280q0 83-58.5 141.5T200-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm155-5v-200L312-512q-12-11-18-25.5t-6-30.5q0-16 6.5-30.5T312-624l112-112q12-12 27.5-18t32.5-6q17 0 32.5 6t27.5 18l76 76q28 28 64 44t76 16v80q-57 0-108.5-22T560-604l-32-32-96 96 88 92v248h-80Zm123.5-563.5Q540-787 540-820t23.5-56.5Q587-900 620-900t56.5 23.5Q700-853 700-820t-23.5 56.5Q653-740 620-740t-56.5-23.5ZM760-80q-83 0-141.5-58.5T560-280q0-83 58.5-141.5T760-480q83 0 141.5 58.5T960-280q0 83-58.5 141.5T760-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Z",
    bike: "M200-80q-83 0-141.5-58.5T0-280q0-83 58.5-141.5T200-480q83 0 141.5 58.5T400-280q0 83-58.5 141.5T200-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm155-5v-200L312-512q-12-11-18-25.5t-6-30.5q0-16 6.5-30.5T312-624l112-112q12-12 27.5-18t32.5-6q17 0 32.5 6t27.5 18l76 76q28 28 64 44t76 16v80q-57 0-108.5-22T560-604l-32-32-96 96 88 92v248h-80Zm123.5-563.5Q540-787 540-820t23.5-56.5Q587-900 620-900t56.5 23.5Q700-853 700-820t-23.5 56.5Q653-740 620-740t-56.5-23.5ZM760-80q-83 0-141.5-58.5T560-280q0-83 58.5-141.5T760-480q83 0 141.5 58.5T960-280q0 83-58.5 141.5T760-80Zm85-115q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Z",
    directions_car: "M240-200v40q0 17-11.5 28.5T200-120h-40q-17 0-28.5-11.5T120-160v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-120h-40q-17 0-28.5-11.5T720-160v-40H240Zm-8-360h496l-42-120H274l-42 120Zm-32 80v200-200Zm100 160q25 0 42.5-17.5T360-380q0-25-17.5-42.5T300-440q-25 0-42.5 17.5T240-380q0 25 17.5 42.5T300-320Zm360 0q25 0 42.5-17.5T720-380q0-25-17.5-42.5T660-440q-25 0-42.5 17.5T600-380q0 25 17.5 42.5T660-320Zm-460 40h560v-200H200v200Z",
    car: "M240-200v40q0 17-11.5 28.5T200-120h-40q-17 0-28.5-11.5T120-160v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-120h-40q-17 0-28.5-11.5T720-160v-40H240Zm-8-360h496l-42-120H274l-42 120Zm-32 80v200-200Zm100 160q25 0 42.5-17.5T360-380q0-25-17.5-42.5T300-440q-25 0-42.5 17.5T240-380q0 25 17.5 42.5T300-320Zm360 0q25 0 42.5-17.5T720-380q0-25-17.5-42.5T660-440q-25 0-42.5 17.5T600-380q0 25 17.5 42.5T660-320Zm-460 40h560v-200H200v200Z",
    directions_subway: "M240-120v-40l60-40q-59 0-99.5-40.5T160-340v-380q0-83 77-121.5T480-880q172 0 246 37t74 123v380q0 59-40.5 99.5T660-200l60 40v40H240Zm0-440h200v-120H240v120Zm420 80H240h480-60Zm-140-80h200v-120H520v120ZM382.5-337.5Q400-355 400-380t-17.5-42.5Q365-440 340-440t-42.5 17.5Q280-405 280-380t17.5 42.5Q315-320 340-320t42.5-17.5Zm280 0Q680-355 680-380t-17.5-42.5Q645-440 620-440t-42.5 17.5Q560-405 560-380t17.5 42.5Q595-320 620-320t42.5-17.5ZM300-280h360q26 0 43-17t17-43v-140H240v140q0 26 17 43t43 17Zm180-520q-86 0-142.5 10T258-760h448q-18-20-74.5-30T480-800Zm0 40h226-448 222Z",
    subway: "M240-120v-40l60-40q-59 0-99.5-40.5T160-340v-380q0-83 77-121.5T480-880q172 0 246 37t74 123v380q0 59-40.5 99.5T660-200l60 40v40H240Zm0-440h200v-120H240v120Zm420 80H240h480-60Zm-140-80h200v-120H520v120ZM382.5-337.5Q400-355 400-380t-17.5-42.5Q365-440 340-440t-42.5 17.5Q280-405 280-380t17.5 42.5Q315-320 340-320t42.5-17.5Zm280 0Q680-355 680-380t-17.5-42.5Q645-440 620-440t-42.5 17.5Q560-405 560-380t17.5 42.5Q595-320 620-320t42.5-17.5ZM300-280h360q26 0 43-17t17-43v-140H240v140q0 26 17 43t43 17Zm180-520q-86 0-142.5 10T258-760h448q-18-20-74.5-30T480-800Zm0 40h226-448 222Z",
    directions_walk: "m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm203.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z",
    walk: "m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm203.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z",
    home_pin: "M360-440h80v-110h80v110h80v-190l-120-80-120 80v190Zm120 254q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
    home: "M360-440h80v-110h80v110h80v-190l-120-80-120 80v190Zm120 254q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
    keep: "m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z",
    pin: "m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z",
    keep_off: "M680-840v80h-40v327l-80-80v-247H400v87l-87-87-33-33v-47h400ZM480-40l-40-40v-240H240v-80l80-80v-46L56-792l56-56 736 736-58 56-264-264h-6v240l-40 40ZM354-400h92l-44-44-2-2-46 46Zm126-193Zm-78 149Z",
    unpin: "M680-840v80h-40v327l-80-80v-247H400v87l-87-87-33-33v-47h400ZM480-40l-40-40v-240H240v-80l80-80v-46L56-792l56-56 736 736-58 56-264-264h-6v240l-40 40ZM354-400h92l-44-44-2-2-46 46Zm126-193Zm-78 149Z",
    location_on: "M536.5-503.5Q560-527 560-560t-23.5-56.5Q513-640 480-640t-56.5 23.5Q400-593 400-560t23.5 56.5Q447-480 480-480t56.5-23.5ZM480-186q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
    location: "M536.5-503.5Q560-527 560-560t-23.5-56.5Q513-640 480-640t-56.5 23.5Q400-593 400-560t23.5 56.5Q447-480 480-480t56.5-23.5ZM480-186q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
    map: "m600-120-240-84-186 72q-20 8-37-4.5T120-170v-560q0-13 7.5-23t20.5-15l212-72 240 84 186-72q20-8 37 4.5t17 33.5v560q0 13-7.5 23T812-192l-212 72Zm-40-98v-468l-160-56v468l160 56Zm80 0 120-40v-474l-120 46v468Zm-440-10 120-46v-468l-120 40v474Zm440-458v468-468Zm-320-56v468-468Z",
    map_pin_heart: "M480-388q54-50 84-80t47-50q16-20 22.5-37t6.5-37q0-36-26-62t-62-26q-21 0-40.5 8.5T480-648q-12-15-31-23.5t-41-8.5q-36 0-62 26t-26 62q0 21 6 37t22 36q17 20 46 50t86 81Zm0 202q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
    map_search: "M640-560v-126 126ZM174-132q-20 8-37-4.5T120-170v-560q0-13 7.5-23t20.5-15l212-72 240 84 186-72q20-8 37 4.5t17 33.5v337q-15-23-35.5-42T760-528v-204l-120 46v126q-21 0-41 3.5T560-546v-140l-160-56v523l-226 87Zm26-96 120-46v-468l-120 40v474Zm496.5-32q22.5-20 23.5-60 1-34-22.5-57T640-400q-34 0-57 23t-23 57q0 34 23 57t57 23q34 0 56.5-20ZM640-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 43.5T778-238l102 102-56 56-102-102q-18 11-38.5 16.5T640-160ZM320-742v468-468Z",
    mail: "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z",
    person: "M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z",
    public: "M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM440-162v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q41-45 62.5-100.5T800-480q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z",
    search: "M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z",
    search_off: "M138.5-138.5Q80-197 80-280t58.5-141.5Q197-480 280-480t141.5 58.5Q480-363 480-280t-58.5 141.5Q363-80 280-80t-141.5-58.5ZM824-120 568-376q-12-13-25.5-26.5T516-428q38-24 61-64t23-88q0-75-52.5-127.5T420-760q-75 0-127.5 52.5T240-580q0 6 .5 11.5T242-557q-18 2-39.5 8T164-535q-2-11-3-22t-1-23q0-109 75.5-184.5T420-840q109 0 184.5 75.5T680-580q0 43-13.5 81.5T629-428l251 252-56 56Zm-615-61 71-71 70 71 29-28-71-71 71-71-28-28-71 71-71-71-28 28 71 71-71 71 28 28Z",
    sunny: "M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm113-170q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Zm283-57q47-47 47-113t-47-113q-47-47-113-47t-113 47q-47 47-47 113t47 113q47 47 113 47t113-47ZM480-480Z",
    train: "M160-340v-380q0-53 27.5-84.5t72.5-48q45-16.5 102.5-22T480-880q66 0 124.5 5.5t102 22q43.5 16.5 68.5 48t25 84.5v380q0 59-40.5 99.5T660-200l60 60v20h-80l-80-80H400l-80 80h-80v-20l60-60q-59 0-99.5-40.5T160-340Zm320-460q-106 0-155 12.5T258-760h448q-15-17-64.5-28.5T480-800ZM240-560h200v-120H240v120Zm420 80H240h480-60Zm-140-80h200v-120H520v120ZM383-337q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm280 0q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-363 57h360q26 0 43-17t17-43v-140H240v140q0 26 17 43t43 17Zm180-480h226-448 222Z",
    verified: "m344-60-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm34-102 102-44 104 44 56-96 110-26-10-112 74-84-74-86 10-112-110-24-58-96-102 44-104-44-56 96-110 24 10 112-74 86 74 84-10 114 110 24 58 96Zm102-318Zm-42 142 226-226-56-58-170 170-86-84-56 56 142 142Z"
};



function googleIcon(name, size = '1.1em', extraStyle = '', extraClass = '') {
    const key = String(name || '').toLowerCase().trim();
    const path = GOOGLE_ICONS[key];
    if (path) {
        return `<svg class="google-icon ${extraClass}" style="width: ${size}; height: ${size}; vertical-align: -0.18em; fill: currentColor; ${extraStyle}" viewBox="0 -960 960 960"><path d="${path}"/></svg>`;
    }
    return `<span class="material-symbols-outlined ${extraClass}" style="font-size: ${size}; vertical-align: -0.18em; ${extraStyle}">${name}</span>`;
}


window.googleIcon = googleIcon;


window.GOOGLE_ICONS = GOOGLE_ICONS;



let entityConfigs = {};


let lastActiveView = 'chat';



function updateContextualHeader(viewName) {
    const contexts = document.querySelectorAll('.header-context');
    contexts.forEach(el => el.style.display = 'none');

    if (viewName === 'dashboard') viewName = 'calendar';
    let targetId = 'header-context-' + (viewName || 'chat');
    let targetEl = document.getElementById(targetId);
    if (!targetEl) {
        targetEl = document.getElementById('header-context-chat');
    }
    if (targetEl) {
        targetEl.style.display = 'flex';
    }

    // Calendar Header setup
    if (viewName === 'calendar') {
        const dateInput = document.getElementById('header-calendar-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0];
        }
    } else if (viewName === 'mail') {
        const searchBar = document.getElementById('header-mail-search-bar');
        const defaultBar = document.getElementById('header-mail-default-bar');
        const readBar = document.getElementById('header-mail-read-bar');
        if (document.body.classList.contains('mail-read-active')) {
            if (searchBar) searchBar.style.display = 'none';
            if (defaultBar) defaultBar.style.display = 'none';
            if (readBar) readBar.style.display = 'flex';
        } else {
            if (readBar) readBar.style.display = 'none';
            if (searchBar && defaultBar && !currentMailSearchQuery) {
                searchBar.style.display = 'none';
                defaultBar.style.display = 'flex';
            }
        }
    } else if (viewName === 'memory') {
        const searchBar = document.getElementById('header-memory-search-bar');
        const defaultBar = document.getElementById('header-memory-default-bar');
        if (searchBar && defaultBar && !personSearchQuery) {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
        }
    } else if (viewName === 'locations') {
        const searchBar = document.getElementById('header-locations-search-bar');
        const defaultBar = document.getElementById('header-locations-default-bar');
        if (searchBar && defaultBar && (!window.locationSearchQuery)) {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
        }
    } else if (viewName === 'photos') {
        const searchBar = document.getElementById('header-photos-search-bar');
        const defaultBar = document.getElementById('header-photos-default-bar');
        if (searchBar && defaultBar && (!window.photosSearchQuery)) {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
        }
    } else if (viewName === 'docs') {
        const searchBar = document.getElementById('header-docs-search-bar');
        const defaultBar = document.getElementById('header-docs-default-bar');
        if (searchBar && defaultBar && (!window.docsSearchQuery)) {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
        }
    } else if (viewName === 'media') {
        const searchBar = document.getElementById('header-media-search-bar');
        const defaultBar = document.getElementById('header-media-default-bar');
        if (searchBar && defaultBar && (!window.mediaSearchQuery)) {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
        }
    } else if (viewName === 'projects') {
        if (typeof updateProjectsHeader === 'function' && !window.activeProjectDetailId) {
            updateProjectsHeader(null);
        }
    }
}


window.updateContextualHeader = updateContextualHeader;



let currentMemoryPeopleList = [];


let personSearchQuery = '';



function toggleHeaderMemorySearch() {
    const searchBar = document.getElementById('header-memory-search-bar');
    const defaultBar = document.getElementById('header-memory-default-bar');
    const searchInput = document.getElementById('header-memory-search-input');
    if (!searchBar || !defaultBar) return;

    if (searchBar.style.display === 'none' || searchBar.style.display === '') {
        searchBar.style.display = 'flex';
        defaultBar.style.display = 'none';
        if (searchInput) {
            searchInput.value = personSearchQuery || '';
            searchInput.focus();
        }
    } else {
        searchBar.style.display = 'none';
        defaultBar.style.display = 'flex';
        personSearchQuery = '';
        if (searchInput) {
            searchInput.value = '';
            filterPeopleBySearch('');
        }
    }
}


window.toggleHeaderMemorySearch = toggleHeaderMemorySearch;



function filterPeopleBySearch(query) {
    personSearchQuery = (query || '').trim().toLowerCase();
    renderFilteredPeopleList();
}


window.filterPeopleBySearch = filterPeopleBySearch;



function getFilteredPeopleListHtml(peopleList = currentMemoryPeopleList, query = personSearchQuery) {
    const q = (query || '').trim().toLowerCase();
    const filtered = (peopleList || []).filter(p => {
        if (!q) return true;
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const aliasesMatch = (p.aliases || []).some(alias => (alias || '').toLowerCase().includes(q));
        const notesMatch = (p.notes || '').toLowerCase().includes(q);
        return nameMatch || aliasesMatch || notesMatch;
    });

    if (filtered.length === 0) {
        if (!peopleList || peopleList.length === 0) {
            return `<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 10px 0;">Keine Personen im Gedächtnis.</p>`;
        } else {
            return `<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 15px 0;">Keine Treffer für "${escapeHtml(query)}".</p>`;
        }
    }

    // Sortierung: 1. Mein Profil, 2. Favoriten, 3. Restliche Personen alphabetisch
    filtered.sort((a, b) => {
        if (a.isOwner) return -1;
        if (b.isOwner) return 1;
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    let html = '';
    filtered.forEach(p => {
        const escName = escapeHtml(p.name).replace(/"/g, '&quot;');
        const aliasesStr = (p.aliases && p.aliases.length > 0) ? p.aliases.map(a => escapeHtml(a)).join(', ') : '';
        const aliasBadge = aliasesStr ? `<div style="font-size: 0.7rem; color: #89b4fa; opacity: 0.85; margin-top: 1px;">🏷️ Spitznamen: ${aliasesStr}</div>` : '';

        if (p.isOwner) {
            const personContent = `
                        <div style="background: rgba(203, 166, 247, 0.12); border: 1.5px solid #cba6f7; padding: 10px 12px; border-radius: 8px; transition: all 0.2s; box-shadow: 0 0 15px rgba(203, 166, 247, 0.1); width: 100%; user-select: none;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 0.85rem;">⭐</span>
                                    <strong style="font-size: 0.9rem; color: #cba6f7;">Mein Profil (${escapeHtml(p.name)})</strong>
                                </div>
                            </div>
                            ${aliasBadge}
                            <div style="font-size: 0.75rem; opacity: 0.85; color: #cdd6f4; line-height: 1.35; max-height: 2.7em; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;">${escapeHtml(p.notes || '')}</div>
                        </div>
                    `;
            const extraPersonData = `data-person-id="${p.id}" data-person-name="${escName}" data-person-is-favorite="false" data-person-is-owner="true"`;
            html += renderSwipeLinkWrapper(personContent, p.name, 'person', p.id, '', '', '', extraPersonData);
        } else if (p.isFavorite) {
            const personContent = `
                        <div style="background: rgba(249, 226, 175, 0.08); border: 1.5px solid rgba(249, 226, 175, 0.35); padding: 8px 10px; border-radius: 8px; transition: all 0.2s; width: 100%; user-select: none; box-shadow: 0 0 10px rgba(249, 226, 175, 0.08);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <span style="color: #f9e2af; font-size: 0.8rem;" title="Favorit">⭐</span>
                                    <strong style="font-size: 0.85rem; color: #f9e2af;">${escapeHtml(p.name)}</strong>
                                </div>
                            </div>
                            ${aliasBadge}
                            <div style="font-size: 0.75rem; opacity: 0.8; line-height: 1.35; max-height: 2.7em; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;">${escapeHtml(p.notes || '')}</div>
                        </div>
                    `;
            const extraPersonData = `data-person-id="${p.id}" data-person-name="${escName}" data-person-is-favorite="true" data-person-is-owner="false"`;
            html += renderSwipeLinkWrapper(personContent, p.name, 'person', p.id, '', '', '', extraPersonData);
        } else {
            const personContent = `
                        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); padding: 8px 10px; border-radius: 8px; transition: all 0.2s; width: 100%; user-select: none;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="font-size: 0.85rem; color: var(--accent);">${escapeHtml(p.name)}</strong>
                            </div>
                            ${aliasBadge}
                            <div style="font-size: 0.75rem; opacity: 0.8; line-height: 1.35; max-height: 2.7em; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;">${escapeHtml(p.notes || '')}</div>
                        </div>
                    `;
            const extraPersonData = `data-person-id="${p.id}" data-person-name="${escName}" data-person-is-favorite="false" data-person-is-owner="false"`;
            html += renderSwipeLinkWrapper(personContent, p.name, 'person', p.id, '', '', '', extraPersonData);
        }
    });
    return html;
}


window.getFilteredPeopleListHtml = getFilteredPeopleListHtml;



function renderFilteredPeopleList() {
    const container = document.getElementById('memory-people-list-container');
    if (container) {
        container.innerHTML = getFilteredPeopleListHtml();
    }
}


window.renderFilteredPeopleList = renderFilteredPeopleList;



function toggleHeaderMailSearch() {
    const searchBar = document.getElementById('header-mail-search-bar');
    const defaultBar = document.getElementById('header-mail-default-bar');
    const searchInput = document.getElementById('header-mail-search-input');
    if (!searchBar || !defaultBar) return;

    if (searchBar.style.display === 'none' || searchBar.style.display === '') {
        searchBar.style.display = 'flex';
        defaultBar.style.display = 'none';
        if (searchInput) {
            searchInput.value = currentMailSearchQuery || '';
            searchInput.focus();
        }
    } else {
        searchBar.style.display = 'none';
        defaultBar.style.display = 'flex';
        if (searchInput) {
            searchInput.value = '';
            filterMailBySearch('');
        }
    }
}


window.toggleHeaderMailSearch = toggleHeaderMailSearch;



// Timer & Wecker Modal Handlers
window.currentTimerModalMode = 'alarm';

function setTimerModalMode(mode) {
    window.currentTimerModalMode = mode;
    const btnCountdown = document.getElementById('timer-mode-btn-countdown');
    const btnAlarm = document.getElementById('timer-mode-btn-alarm');
    const countdownGroup = document.getElementById('timer-countdown-group');
    const alarmGroup = document.getElementById('timer-alarm-group');
    const titleModal = document.getElementById('timer-modal-header-title');
    const saveBtn = document.getElementById('timer-modal-save-btn');

    if (btnCountdown) btnCountdown.classList.toggle('active', mode === 'countdown');
    if (btnAlarm) btnAlarm.classList.toggle('active', mode === 'alarm');
    if (countdownGroup) countdownGroup.style.display = (mode === 'countdown') ? 'block' : 'none';
    if (alarmGroup) alarmGroup.style.display = (mode === 'alarm') ? 'block' : 'none';
    if (titleModal) titleModal.textContent = (mode === 'alarm') ? '⏰ Wecker stellen' : '⏱️ Timer starten';
    if (saveBtn) saveBtn.textContent = (mode === 'alarm') ? 'Wecker stellen' : 'Timer starten';
}
window.setTimerModalMode = setTimerModalMode;

function openTimerModal(defaultMode = 'alarm') {
    const titleInput = document.getElementById('timer-title-input');
    const minInput = document.getElementById('timer-minutes-input');
    const secInput = document.getElementById('timer-seconds-input');
    const timeInput = document.getElementById('timer-alarm-time-input');
    if (titleInput) titleInput.value = '';
    if (minInput) minInput.value = '5';
    if (secInput) secInput.value = '0';
    if (timeInput) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 15);
        timeInput.value = now.toTimeString().substring(0, 5);
    }
    setTimerModalMode(defaultMode);
    const modal = document.getElementById('timer-modal');
    if (modal) modal.style.display = 'block';
    document.body.classList.add('modal-active');
    setTimeout(() => { if (titleInput) titleInput.focus(); }, 50);
}
window.openTimerModal = openTimerModal;
window.openAlarmModal = () => openTimerModal('alarm');

function closeTimerModal() {
    const modal = document.getElementById('timer-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-active');
}
window.closeTimerModal = closeTimerModal;

function setTimerDuration(mins) {
    const minInput = document.getElementById('timer-minutes-input');
    const secInput = document.getElementById('timer-seconds-input');
    if (minInput) minInput.value = mins;
    if (secInput) secInput.value = '0';
}
window.setTimerDuration = setTimerDuration;

async function saveTimerFromModal() {
    const titleInput = document.getElementById('timer-title-input');
    const mode = window.currentTimerModalMode || 'alarm';
    const rawTitle = (titleInput && titleInput.value.trim());

    if (mode === 'alarm') {
        const timeInput = document.getElementById('timer-alarm-time-input');
        const timeVal = timeInput ? timeInput.value : '';
        if (!timeVal) {
            alert("Bitte eine Weckzeit angeben.");
            return;
        }
        const [h, m] = timeVal.split(':').map(Number);
        const target = new Date();
        target.setHours(h, m, 0, 0);
        if (target.getTime() <= Date.now()) {
            // Target time already past today, set for tomorrow
            target.setDate(target.getDate() + 1);
        }
        closeTimerModal();
        try {
            const title = rawTitle || `Wecker ${timeVal} Uhr`;
            await callTool('erstelle_timer', { titel: title, expiresAt: target.toISOString() });
            loadTopWidgets();
        } catch (e) {
            console.error("Fehler beim Erstellen des Weckers:", e);
            alert("Fehler beim Stellen des Weckers.");
        }
    } else {
        const minInput = document.getElementById('timer-minutes-input');
        const secInput = document.getElementById('timer-seconds-input');
        const minutes = (minInput && parseInt(minInput.value)) || 0;
        const seconds = (secInput && parseInt(secInput.value)) || 0;
        const totalSecs = (minutes * 60) + seconds;
        if (totalSecs <= 0) {
            alert("Bitte eine Dauer größer als 0 Sekunden angeben.");
            return;
        }
        closeTimerModal();
        try {
            const title = rawTitle || 'Timer';
            await callTool('erstelle_timer', { titel: title, sekunden: totalSecs });
            loadTopWidgets();
        } catch (e) {
            console.error("Fehler beim Erstellen des Timers:", e);
            alert("Fehler beim Starten des Timers.");
        }
    }
}
window.saveTimerFromModal = saveTimerFromModal;



// Person Create Modal Handlers
function openPersonCreateModal() {
    const nameInput = document.getElementById('person-create-name-input');
    if (nameInput) nameInput.value = '';
    const modal = document.getElementById('person-create-modal');
    if (modal) modal.style.display = 'block';
    document.body.classList.add('modal-active');
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 50);
}


window.openPersonCreateModal = openPersonCreateModal;



function closePersonCreateModal() {
    const modal = document.getElementById('person-create-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-active');
}


window.closePersonCreateModal = closePersonCreateModal;



async function savePersonCreateFromModal() {
    const nameInput = document.getElementById('person-create-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        alert("Bitte einen Namen für die Person eingeben.");
        return;
    }
    closePersonCreateModal();
    try {
        const res = await callTool('aktualisiere_person_biografie', { name: name, biografie: '' });
        await loadTopWidgets();
        if (res && res.personId) {
            openPersonProfileModal(res.personId);
        } else {
            const widgetRes = await fetch(getApiUrl('/widgets'));
            if (widgetRes.ok) {
                const widgets = await widgetRes.json();
                const mem = widgets.find(w => w.data && w.data.widgetType === 'memory_people_list');
                if (mem && mem.data && mem.data.people) {
                    const created = mem.data.people.find(p => p.name === name);
                    if (created) openPersonProfileModal(created.id);
                }
            }
        }
    } catch (e) {
        console.error("Fehler beim Erstellen der Person:", e);
        alert("Fehler beim Erstellen der Person.");
    }
}


window.savePersonCreateFromModal = savePersonCreateFromModal;

function getElementTopRelativeToParent(element, parent) {
    let top = 0;
    let curr = element;
    while (curr && curr !== parent && curr !== document.body) {
        top += curr.offsetTop || 0;
        curr = curr.offsetParent;
    }
    return top;
}

function scrollElementInsideTopPanel(targetEl, block = 'start', behavior = 'smooth') {
    const topPanel = document.querySelector('.top-panel');
    if (!topPanel || !targetEl) return;

    const panelHeight = topPanel.clientHeight;
    if (panelHeight === 0) {
        setTimeout(() => scrollElementInsideTopPanel(targetEl, block, behavior), 60);
        return;
    }

    const panelRect = topPanel.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    let relativeTop;
    if (panelRect.height > 0 && targetRect.height > 0) {
        relativeTop = (targetRect.top - panelRect.top) + topPanel.scrollTop;
    } else {
        relativeTop = getElementTopRelativeToParent(targetEl, topPanel);
    }

    const targetHeight = targetRect.height || targetEl.offsetHeight || 80;
    let targetScrollTop = relativeTop;

    if (block === 'center') {
        targetScrollTop = relativeTop - (panelHeight / 2) + (targetHeight / 2);
    } else if (block === 'start') {
        targetScrollTop = relativeTop - 15;
    }

    const finalScrollTop = Math.max(0, targetScrollTop);

    if (typeof topPanel.scrollTo === 'function') {
        topPanel.scrollTo({
            top: finalScrollTop,
            behavior: behavior
        });
    } else {
        topPanel.scrollTop = finalScrollTop;
    }
}
window.scrollElementInsideTopPanel = scrollElementInsideTopPanel;

function flashTimelineDay(el) {
    if (!el) return;
    el.classList.add('timeline-jump-highlight');
    setTimeout(() => {
        el.classList.remove('timeline-jump-highlight');
    }, 1800);
}
window.flashTimelineDay = flashTimelineDay;

function switchMobileView(viewName) {
    if (viewName !== 'settings') {
        lastActiveView = viewName;
    }

    // Close mail read modal if open and navigating away from mail view
    if (window.isClosingMailReadModal !== true && document.body.classList.contains('mail-read-active') && viewName !== 'mail') {
        if (typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
    }

    // Remove all view classes from body
    document.body.classList.remove('view-chat', 'view-dashboard', 'view-calendar', 'view-timer', 'view-tasks', 'view-projects', 'view-plugins', 'view-settings', 'view-history', 'view-memory', 'view-locations', 'view-media', 'view-photos', 'view-docs', 'view-journal', 'view-mail', 'view-briefing');

    // Add the new active view class
    document.body.classList.add('view-' + viewName);
    if (viewName !== 'chat' && viewName !== 'settings' && viewName !== 'history') {
        document.body.classList.add('view-plugins'); // keeps general plugin panel visible on mobile
    }

    // Set active nav styling
    setActiveNav(viewName);

    // Update contextual header
    updateContextualHeader(viewName);

    // Update the title in top-panel header dynamically
    const titleEl = document.getElementById('plugin-view-title');
    if (titleEl) {
        const titles = {
            'dashboard': 'Kalender',
            'briefing': 'Agent-Briefing',
            'calendar': 'Kalender',
            'timer': 'Wecker',
            'projects': 'Projekte & Aufgaben',
            'memory': 'Personen',
            'locations': 'Orte',
            'photos': 'Fotos & Galerie',
            'docs': 'Dokumente & Dateien',
            'media': 'Dateien & Fotos',
            'mail': 'E-Mails (Posteingang)'
        };
        titleEl.textContent = titles[viewName] || 'Plugins & Dashboard';
    }

    // Update mobile header title dynamically
    const mobTitleEl = document.getElementById('mobile-view-title');
    if (mobTitleEl) {
        const titles = {
            'dashboard': 'Kalender',
            'briefing': 'Agent-Briefing',
            'calendar': 'Kalender',
            'timer': 'Timer',
            'projects': 'Projekte',
            'memory': 'Gedächtnis',
            'locations': 'Orte',
            'photos': 'Fotos',
            'docs': 'Dokumente',
            'media': 'Dateien',
            'mail': 'E-Mails',
            'chat': 'Chat',
            'history': 'Verlauf',
            'settings': 'Einstellungen'
        };
        mobTitleEl.textContent = titles[viewName] || 'kiSystem';
    }

    // If it's a plugin view, we scroll it to top on desktop, or reset scroll on mobile
    if (viewName !== 'chat' && viewName !== 'settings' && viewName !== 'history') {
        if (viewName === 'calendar') {
            const scrollToToday = (behavior = 'auto') => {
                const todayStr = getLocalDateString();
                const todayEl = document.getElementById(`timeline-day-${todayStr}`);
                if (todayEl) {
                    scrollElementInsideTopPanel(todayEl, 'start', behavior);
                }
            };
            scrollToToday('auto');
            requestAnimationFrame(() => scrollToToday('auto'));
            setTimeout(() => scrollToToday('auto'), 60);
            setTimeout(() => scrollToToday('smooth'), 180);
        } else if (document.body.classList.contains('mobile-mode')) {
            const topPanel = document.querySelector('.top-panel');
            if (topPanel) {
                topPanel.scrollTop = 0;
            }
        } else {
            setTimeout(() => {
                const el = document.getElementById('widget-' + viewName);
                if (el) {
                    scrollElementInsideTopPanel(el, 'start', 'auto');
                }
            }, 50);
        }
    }

    // Force keyboard to close on mobile view switch by blurring active inputs (nur wenn nicht zur Chat-Ansicht gewechselt wird)
    if (viewName !== 'chat' && document.body.classList.contains('mobile-mode')) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }

    // Force page scroll reset to prevent viewport shifting/cut-off on mobile
    window.scrollTo(0, 0);

    // Sync sections visibility
    if (viewName === 'chat') {
        if (typeof chatSection !== 'undefined' && chatSection && chatSection.style.display === 'none') {
            showSection('chat');
        }
    } else if (viewName === 'history') {
        if (typeof historySection !== 'undefined' && historySection && historySection.style.display === 'none') {
            showSection('history');
        }
    } else if (viewName === 'settings') {
        if (typeof settingsSection !== 'undefined' && settingsSection && settingsSection.style.display === 'none') {
            showSection('settings');
        }
    } else {
        // In all plugin views (calendar, timer, projects, memory, mail, tasks, journal), ensure chat section is active
        if (typeof chatSection !== 'undefined' && chatSection) {
            chatSection.style.display = 'flex';
        }
        if (typeof historySection !== 'undefined' && historySection) {
            historySection.style.display = 'none';
        }
        if (typeof settingsSection !== 'undefined' && settingsSection) {
            settingsSection.style.display = 'none';
        }
    }

    // Update bottom navigation tabs (Chat & Kalender & Briefing & Orte & Medien)
    const tabChat = document.getElementById('tab-btn-chat');
    const tabDashboard = document.getElementById('tab-btn-dashboard');
    const tabBriefing = document.getElementById('tab-btn-briefing');
    const tabLocations = document.getElementById('tab-btn-locations');
    const tabPhotos = document.getElementById('tab-btn-photos');
    const tabDocs = document.getElementById('tab-btn-docs');
    const tabMedia = document.getElementById('tab-btn-media');
    if (tabChat && tabDashboard) {
        tabChat.classList.remove('active');
        tabDashboard.classList.remove('active');
        if (tabBriefing) tabBriefing.classList.remove('active');
        if (tabLocations) tabLocations.classList.remove('active');
        if (tabPhotos) tabPhotos.classList.remove('active');
        if (tabDocs) tabDocs.classList.remove('active');
        if (tabMedia) tabMedia.classList.remove('active');
        if (viewName === 'chat') {
            tabChat.classList.add('active');
        } else if (viewName === 'dashboard' || viewName === 'calendar') {
            tabDashboard.classList.add('active');
        } else if (viewName === 'briefing' && tabBriefing) {
            tabBriefing.classList.add('active');
        } else if (viewName === 'locations' && tabLocations) {
            tabLocations.classList.add('active');
        } else if (viewName === 'photos' && tabPhotos) {
            tabPhotos.classList.add('active');
        } else if (viewName === 'docs' && tabDocs) {
            tabDocs.classList.add('active');
        } else if (viewName === 'media') {
            if (tabPhotos) tabPhotos.classList.add('active');
            else if (tabMedia) tabMedia.classList.add('active');
        }
    }

    // Scroll chat to bottom so newest messages are visible
    const chatBoxEl = document.getElementById('chat-box');
    if (chatBoxEl) {
        setTimeout(() => {
            chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
        }, 50);
    }

    if (window.AppRouter && typeof window.AppRouter.onViewChanged === 'function') {
        window.AppRouter.onViewChanged(viewName, { conversationId: window.currentConversationId });
    }
}


window.switchMobileView = switchMobileView;



function toggleDashboardChat() {
    if (document.body.classList.contains('mail-read-active')) {
        if (typeof closeMailReadModal === 'function') closeMailReadModal();
        switchMobileView('calendar');
        return;
    }
    if (document.body.classList.contains('view-dashboard') || document.body.classList.contains('view-calendar')) {
        switchMobileView('chat');
    } else {
        switchMobileView('calendar');
    }
}


window.toggleDashboardChat = toggleDashboardChat;



function openMobileSettings() {
    loadSettings();
    switchMobileView('settings');
    showSection('settings');
}


window.openMobileSettings = openMobileSettings;



function handleDrawerJournal() {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    switchMobileView('journal');
}


window.handleDrawerJournal = handleDrawerJournal;



function handleDrawerMail() {
    closeMobileDrawer();
    focusWidget('mail');
}


window.handleDrawerMail = handleDrawerMail;



function toggleKeyboard() {
    document.body.classList.toggle('keyboard-active');
    const isActive = document.body.classList.contains('keyboard-active');

    const keyBtn = document.getElementById('btn-toggle-keyboard');
    if (keyBtn) {
        if (isActive) {
            keyBtn.style.borderColor = 'var(--accent)';
            keyBtn.style.color = 'var(--accent)';
            keyBtn.style.background = 'rgba(137, 180, 250, 0.15)';
        } else {
            keyBtn.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            keyBtn.style.color = 'var(--text)';
            keyBtn.style.background = 'rgba(255, 255, 255, 0.04)';
        }
    }

    if (isActive) {
        setTimeout(() => {
            userInput.focus();
        }, 100);
    } else {
        userInput.blur();
    }
}


window.toggleKeyboard = toggleKeyboard;



function setActiveNav(viewName) {
    // Remove active classes from all nav buttons
    document.querySelectorAll('.plugin-nav-btn, .main-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.background = '';
    });

    // Set active class on the correct button
    const activeBtn = document.getElementById('btn-nav-' + viewName);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}



function toggleMobileView() {
    if (document.body.classList.contains('view-chat')) {
        switchMobileView('dashboard');
    } else {
        switchMobileView('chat');
    }
}


window.toggleMobileView = toggleMobileView;

function focusWidget(name) {
    if (name === 'arbeitstisch' || name === 'heute' || name === 'dashboard') name = 'calendar';
    if (name === 'media') {
        name = document.getElementById('widget-photos') ? 'photos' : (document.getElementById('widget-docs') ? 'docs' : 'media');
    }
    if (window.isClosingMailReadModal !== true && document.body.classList.contains('mail-read-active') && name !== 'mail') {
        if (typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
    }
    if (document.body.classList.contains('mobile-mode')) {
        switchMobileView(name);
        const el = document.getElementById('widget-' + name);
        if (!el) {
            loadTopWidgets();
        }
    } else {
        if (name === 'calendar') {
            const todayStr = getLocalDateString();
            const todayEl = document.getElementById(`timeline-day-${todayStr}`);
            if (todayEl) {
                scrollElementInsideTopPanel(todayEl, 'start', 'smooth');
                flashTimelineDay(todayEl);
                return;
            }
        }
        const el = document.getElementById('widget-' + name);
        if (el) {
            scrollElementInsideTopPanel(el, 'start', 'smooth');
            // Highlight effect: outline accent glow
            el.style.transition = 'all 0.3s';
            el.style.outline = '2px solid var(--accent)';
            el.style.outlineOffset = '2px';
            setTimeout(() => {
                el.style.outline = 'none';
            }, 1500);
        } else {
            console.warn('Widget not found: widget-' + name);
            loadTopWidgets();
        }
    }

    if (window.AppRouter && typeof window.AppRouter.onViewChanged === 'function') {
        window.AppRouter.onViewChanged(name);
    }
}


window.focusWidget = focusWidget;



async function callTool(name, args) {
    try {
        const res = await fetch(getApiUrl('/api/tools/call'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, arguments: args })
        });
        const isReadOnly = typeof name === 'string' && (name.startsWith('hole_') || name.startsWith('suche_') || name.startsWith('lies_') || name.startsWith('get_'));
        if (!isReadOnly) {
            loadTopWidgets();
            if (isElectron && ipcRenderer) {
                ipcRenderer.send('widgets-updated');
            }
        }
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Tool Call Error:", e);
    }
    return null;
}



window.callTool = callTool;



function showTimerNotification(title, message, timerId) {
    if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.showTimerNotification === 'function') {
        window.AndroidWidgetInterface.showTimerNotification(title, message, timerId);
    } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.showTimerNotification === 'function') {
        window.Capacitor.Plugins.WidgetSettings.showTimerNotification({ title, message, timerId });
    } else if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        } catch (e) {
            console.error("Browser notification error:", e);
        }
    }
}



function cancelScheduledTimerAlarm(timerId) {
    if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.cancelScheduledTimerAlarm === 'function') {
        window.AndroidWidgetInterface.cancelScheduledTimerAlarm(timerId);
    } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.cancelScheduledTimerAlarm === 'function') {
        window.Capacitor.Plugins.WidgetSettings.cancelScheduledTimerAlarm({ timerId });
    }
}



function playAlarmBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        function beep(freq, duration, delay) {
            setTimeout(() => {
                try {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
                    osc.start();
                    osc.stop(audioCtx.currentTime + duration);
                } catch (e) {}
            }, delay);
        }
        beep(880, 0.18, 0);
        beep(1100, 0.18, 200);
        beep(880, 0.18, 400);
        beep(1100, 0.18, 600);
    } catch (e) {
        console.error("Audio beep error:", e);
    }
}
window.playAlarmBeep = playAlarmBeep;

function playAlarmSound() {
    if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.playAlarmSound === 'function') {
        window.AndroidWidgetInterface.playAlarmSound();
    } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.playAlarmSound === 'function') {
        window.Capacitor.Plugins.WidgetSettings.playAlarmSound();
    } else {
        playAlarmBeep();
    }
}
window.playAlarmSound = playAlarmSound;

function stopAlarmSound(timerId) {
    if (window.activeAlarmIntervals) {
        if (timerId !== undefined && timerId !== null) {
            const iv = window.activeAlarmIntervals.get(Number(timerId));
            if (iv) {
                clearInterval(iv);
                window.activeAlarmIntervals.delete(Number(timerId));
            }
        } else {
            window.activeAlarmIntervals.forEach(iv => clearInterval(iv));
            window.activeAlarmIntervals.clear();
        }
    }
    if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.stopAlarmSound === 'function') {
        window.AndroidWidgetInterface.stopAlarmSound();
    } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.stopAlarmSound === 'function') {
        window.Capacitor.Plugins.WidgetSettings.stopAlarmSound();
    }
}
window.stopAlarmSound = stopAlarmSound;



// updateAllCountdowns interval moved to timer.js



function formatEventTime(ev) {
    const start = new Date(ev.time);
    const end = ev.endTime ? new Date(ev.endTime) : start;

    const formatTime = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

    const isSameDay = start.toDateString() === end.toDateString();

    let timeStr = "";
    if (ev.isAllDay) {
        if (isSameDay) {
            timeStr = `${formatDate(start)} (Ganztägig)`;
        } else {
            const days = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000));
            const daysStr = days > 1 ? `${days} Tage` : '2 Tage';
            timeStr = `${formatDate(start)} - ${formatDate(end)} (${daysStr}, Ganztägig)`;
        }
    } else {
        if (isSameDay) {
            timeStr = `${formatDate(start)}, ${formatTime(start)} - ${formatTime(end)}`;
        } else {
            const days = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000));
            const daysStr = days > 1 ? `${days} Tage` : '2 Tage';
            timeStr = `${formatDate(start)} ${formatTime(start)} - ${formatDate(end)} ${formatTime(end)} (${daysStr})`;
        }
    }

    if (ev.originalStart) {
        const origStart = new Date(ev.originalStart);
        const origEnd = ev.originalEnd ? new Date(ev.originalEnd) : new Date(origStart.getTime() + (end.getTime() - start.getTime()));
        const origIsSameDay = origStart.toDateString() === origEnd.toDateString();

        let origTimeStr = "";
        if (ev.isAllDay) {
            if (origIsSameDay) {
                origTimeStr = `${formatDate(origStart)}`;
            } else {
                origTimeStr = `${formatDate(origStart)} - ${formatDate(origEnd)}`;
            }
        } else {
            if (origIsSameDay) {
                origTimeStr = `${formatDate(origStart)}, ${formatTime(origStart)} - ${formatTime(origEnd)}`;
            } else {
                origTimeStr = `${formatDate(origStart)} ${formatTime(origStart)} - ${formatDate(origEnd)} ${formatTime(origEnd)}`;
            }
        }

        return `
                    <div class="rescheduled-container" style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="text-decoration: line-through; opacity: 0.5; font-size: 0.7rem;">War: ${origTimeStr}</span>
                        <span style="color: #f9e2af; font-weight: 500; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                            ➔ Neu: ${timeStr}
                        </span>
                    </div>
                `;
    }

    return `<span style="font-size: 0.75rem; opacity: 0.75;">${timeStr}</span>`;
}



function getEventTimeBadges(ev, dateStr) {
    if (!ev) return { startBadge: '', endBadge: '', startStr: '', endStr: '', isStartLocked: false, isEndLocked: false };

    const isTravel = !ev.isTask && (
        ev.isTravelTime || !!ev.travelMode ||
        /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
        (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
    );
    const badgeTypeClass = isTravel ? 'travel-time-badge' : 'event-time-badge';

    let isStartLocked = false;
    let isEndLocked = false;

    if (isTravel) {
        let details = {};
        try {
            if (typeof ev.travelTransitDetails === 'string') {
                details = JSON.parse(ev.travelTransitDetails);
            } else if (ev.travelTransitDetails) {
                details = ev.travelTransitDetails;
            }
        } catch (_) { }

        const titleLower = (ev.title || '').toLowerCase();
        const isArrivalTitle = /^(hinfahrt|anreise|fahrt\s+zu|anreise\s+zu)\b/i.test(titleLower.trim()) || titleLower.includes('hinfahrt') || titleLower.includes('anreise');
        const isDepartureTitle = /^(rückfahrt|rueckfahrt|heimweg|abreise|fahrt\s+nach\s+hause)\b/i.test(titleLower.trim()) || titleLower.includes('rückfahrt') || titleLower.includes('rueckfahrt') || titleLower.includes('heimweg');

        if (details.targetArrivalTime || details.requestedArrivalTime || (isArrivalTitle && !isDepartureTitle)) {
            isEndLocked = true;
        } else if (details.requestedDepartureTime || details.earliestDepartureTime || isDepartureTitle) {
            isStartLocked = true;
        }
    }

    if (ev.isAllDay) {
        let endBadge = '';
        let endStr = '';
        if (ev.endTime || ev.end) {
            const sDate = (ev.time || ev.start) ? new Date(ev.time || ev.start) : null;
            const eDate = new Date(ev.endTime || ev.end);
            if (sDate && !isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && eDate.toDateString() !== sDate.toDateString()) {
                endStr = eDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                endBadge = `<span class="timeline-time-badge ${badgeTypeClass} end-time-badge">${endStr}</span>`;
            }
        }
        return {
            startBadge: `<span class="timeline-time-badge ${badgeTypeClass} start-time-badge" style="background: rgba(149, 165, 166, 0.15); color: #bdc3c7; border-color: rgba(149, 165, 166, 0.3);">Ganztägig</span>`,
            endBadge: endBadge,
            startStr: 'Ganztägig',
            endStr: endStr,
            isStartLocked: false,
            isEndLocked: false
        };
    }

    if (ev.fuzzyTime) {
        let fStyle = '';
        if (ev.fuzzyTime === "morgens") fStyle = "background: rgba(241, 196, 15, 0.15); color: #f1c40f; border-color: rgba(241, 196, 15, 0.3);";
        else if (ev.fuzzyTime === "vormittag") fStyle = "background: rgba(230, 126, 34, 0.15); color: #e67e22; border-color: rgba(230, 126, 34, 0.3);";
        else if (ev.fuzzyTime === "mittags") fStyle = "background: rgba(46, 204, 113, 0.15); color: #2ecc71; border-color: rgba(46, 204, 113, 0.3);";
        else if (ev.fuzzyTime === "nachmittag") fStyle = "background: rgba(52, 152, 219, 0.15); color: #3498db; border-color: rgba(52, 152, 219, 0.3);";
        else if (ev.fuzzyTime === "abends") fStyle = "background: rgba(155, 89, 182, 0.15); color: #9b59b6; border-color: rgba(155, 89, 182, 0.3);";
        return {
            startBadge: `<span class="timeline-time-badge ${badgeTypeClass} start-time-badge" style="${fStyle}">${escapeHtml(ev.fuzzyTime)}</span>`,
            endBadge: '',
            startStr: ev.fuzzyTime,
            endStr: '',
            isStartLocked: false,
            isEndLocked: false
        };
    }

    const eventTime = ev.time || ev.start;
    if (!eventTime) {
        return { startBadge: '', endBadge: '', startStr: '', endStr: '', isStartLocked, isEndLocked };
    }

    const start = new Date(eventTime);
    if (isNaN(start.getTime())) {
        return { startBadge: '', endBadge: '', startStr: '', endStr: '', isStartLocked, isEndLocked };
    }

    const formatTime = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    let startStr = `${formatTime(start)} Uhr`;

    if (dateStr) {
        const startDayStr = typeof getLocalDateString === 'function' ? getLocalDateString(start) : start.toISOString().split('T')[0];
        if (startDayStr !== dateStr) {
            startStr = `${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${formatTime(start)} Uhr`;
        }
    }

    const lockIconStart = isStartLocked
        ? `<span class="time-lock-icon" style="margin-right: 4px; font-size: 0.68rem;" title="Feste Abfahrtszeit (gelockt)">🔒</span>`
        : '';
    const startBadgeTitle = isStartLocked ? 'title="Feste Abfahrtszeit (gelockt)"' : '';
    const startBadge = `<span class="timeline-time-badge ${badgeTypeClass} start-time-badge ${isStartLocked ? 'is-time-locked' : ''}" ${startBadgeTitle}>${lockIconStart}${startStr}</span>`;

    const eventEndTime = ev.endTime || ev.end;
    let endBadge = '';
    let endStr = '';
    if (eventEndTime) {
        const end = new Date(eventEndTime);
        if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) {
            endStr = `${formatTime(end)} Uhr`;
            const endDayStr = typeof getLocalDateString === 'function' ? getLocalDateString(end) : end.toISOString().split('T')[0];
            const refDateStr = dateStr || (typeof getLocalDateString === 'function' ? getLocalDateString(start) : start.toISOString().split('T')[0]);
            if (endDayStr !== refDateStr) {
                endStr = `${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${formatTime(end)} Uhr`;
            }
            const lockIconEnd = isEndLocked
                ? `<span class="time-lock-icon" style="margin-right: 4px; font-size: 0.68rem;" title="Feste Ankunftszeit (gelockt)">🔒</span>`
                : '';
            const endBadgeTitle = isEndLocked ? 'title="Feste Ankunftszeit (gelockt)"' : '';
            endBadge = `<span class="timeline-time-badge ${badgeTypeClass} end-time-badge ${isEndLocked ? 'is-time-locked' : ''}" ${endBadgeTitle}>${lockIconEnd}${endStr}</span>`;
        }
    }

    return { startBadge, endBadge, startStr, endStr, isStartLocked, isEndLocked };
}
window.getEventTimeBadges = getEventTimeBadges;

function getEventTimeBadge(ev) {
    const { startBadge, startStr, endStr, isStartLocked, isEndLocked } = getEventTimeBadges(ev);
    if (endStr) {
        const isTravel = !ev.isTask && (
            ev.isTravelTime || !!ev.travelMode ||
            /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
            (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
        );
        const badgeTypeClass = isTravel ? 'travel-time-badge' : 'event-time-badge';
        const sText = isStartLocked ? `🔒 ${startStr.replace(/ Uhr$/, '')}` : startStr.replace(/ Uhr$/, '');
        const eText = isEndLocked ? `${endStr} 🔒` : endStr;
        const lockTitle = isStartLocked ? 'title="Feste Abfahrtszeit (gelockt)"' : (isEndLocked ? 'title="Feste Ankunftszeit (gelockt)"' : '');
        return `<span class="timeline-time-badge ${badgeTypeClass}" ${lockTitle}>${sText} – ${eText}</span>`;
    }
    return startBadge;
}
window.getEventTimeBadge = getEventTimeBadge;



// Mobile Drawer and Model Selector Handlers
window.toggleMobileDrawer = function () {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');
    if (drawer && overlay) {
        const isOpen = drawer.classList.contains('active');
        if (isOpen) {
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // Refresh history list when opening
            loadHistory().catch(err => console.error("Konnte Verlauf im Drawer nicht laden:", err));
            drawer.classList.add('active');
            overlay.classList.add('active');
        }
    }
};



window.closeMobileDrawer = function () {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('mobile-drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
    }
};



window.handleDrawerNewChat = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    currentConversationId = null;
    window.currentConversationId = null;
    chatBox.innerHTML = '<div class="message ai">Ein neuer Chat wurde gestartet. Wie kann ich dir helfen?</div>';
    showSection('chat');
    if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
        window.AppRouter.updateUrl('/chat');
    }
};



window.handleDrawerSettings = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    openMobileSettings();
};



window.handleDrawerHistorySearch = function () {
    if (typeof applyDrawerHistoryFilter === 'function') {
        applyDrawerHistoryFilter();
    }
};



window.handleDrawerDashboard = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('calendar');
};



window.handleDrawerBriefing = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('briefing');
};



window.handleDrawerTimer = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('timer');
};
window.handleDrawerWecker = window.handleDrawerTimer;

window.deleteTimer = async function(id) {
    if (confirm("Möchtest du diesen Wecker / Timer wirklich löschen?")) {
        try {
            if (typeof stopAlarmSound === 'function') stopAlarmSound(id);
            if (typeof cancelScheduledTimerAlarm === 'function') cancelScheduledTimerAlarm(Number(id));
            await callTool('loesche_timer', { id: Number(id) });
            loadTopWidgets();
        } catch (e) {
            console.error("Fehler beim Löschen des Timers:", e);
        }
    }
};

window.handleDrawerCalendar = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('calendar');
};



window.handleDrawerProjects = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('projects');
};



window.handleDrawerMail = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('mail');
};



window.handleDrawerMemory = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('memory');
};

window.handleDrawerLocations = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('locations');
};

window.handleDrawerPhotos = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('photos');
};

window.handleDrawerDocs = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('docs');
};

window.handleDrawerMedia = function () {
    closeMobileDrawer();
    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
        closeMailReadModal();
    }
    focusWidget('photos');
};



window.openTaskArchiveModal = async function () {
    if (typeof closeMobileDrawer === 'function') closeMobileDrawer();
    if (typeof openProjectsArchive === 'function') {
        openProjectsArchive();
    }
};

window.openTaskTrashModal = window.openTaskArchiveModal;

window.closeTaskArchiveModal = function () {
    if (typeof closeProjectsArchive === 'function') {
        closeProjectsArchive();
    }
    const modal = document.getElementById('task-trash-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-active');
};

window.closeTaskTrashModal = window.closeTaskArchiveModal;