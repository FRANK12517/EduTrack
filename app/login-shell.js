'use strict';
// Shared by the Node server and the Vercel static build.
const PUBLIC_FILES = ['index.html', 'ghana-hierarchy.js', 'privileged-auth.js', 'startup-readiness.js', 'school-login-boot.js', 'school-module-loader.js', 'attendance-register-ui.js', 'admin-dashboard-separation.js', 'school-sidebar.js', 'school-user-guide.js', 'qr-attendance.js', 'hostel-management.js', 'transport-management.js', 'online-admission.js', 'admissions-review.js', 'communication-hub.js', 'chat-module.js', 'control-panel.js', 'analytics-narrative.js', 'quiz-module.js', 'individual-result-slip-fix.js', 'edutrack-design-system.css', 'edutrack-shell.css', 'edutrack-dashboard.css', 'edutrack-dense.css', 'edutrack-polish.css'];
function renderLoginShell(source) {
      let shell = source.toString('latin1');
      // These optional theme files are not present in this distribution. Their
      // stale links return JSON 404 responses and cause strict MIME warnings;
      // the complete shell styling remains embedded in index.html.
      shell = shell.replace(/<link\b[^>]*href=["'](?:\/?)(?:edutrack-design-system|edutrack-shell|edutrack-dashboard|edutrack-dense|edutrack-polish)\.css[^>]*>\s*/gi, '');
      // A later legacy bridge registers optional result helpers during shell
      // boot. Keep its namespace available while those result modules remain
      // inert for the thin School-login path.
      shell = shell.replace(/<head(\s[^>]*)?>/i, tag => `${tag}<script>window.EduTrackLegacyAcademicAdapter=window.EduTrackLegacyAcademicAdapter||{};</script>`);
      // The legacy authority marker can run after a deferred script has replaced
      // its optional login helper. A marker must not make the public shell fail.
      shell = shell.replace('window.v43DoLogin._part9Authoritative=true;', 'if(window.v43DoLogin)window.v43DoLogin._part9Authoritative=true;');
      // The shared ghana-hierarchy.js module exposes the same immutable map to all forms.
      let scriptIndex = -1;
      shell = shell.replace(/<script\b[^>]*>/gi, tag => {
        if (tag.includes('ghana-hierarchy.js')) return tag;
        scriptIndex += 1;
        return scriptIndex > 24 && scriptIndex < 244
          ? tag.replace(/^<script/i, `<script type="application/x-edutrack-lazy" data-edutrack-lazy="true" data-edutrack-script-index="${scriptIndex}"`)
          : tag;
      });
      // Public portal entry controls must initialize without activating retired
      // administrative workbenches. Execute their existing modules unchanged.
      shell = shell.replace(/<script type="application\/x-edutrack-lazy" data-edutrack-lazy="true" data-edutrack-script-index="(\d+)"([^>]*)>([\s\S]*?)<\/script>/g, (tag, index, attributes, source) =>
        /const GH_REGIONS_DISTRICTS\s*=\s*window\.GH_REGIONS_DISTRICTS;|window\.EMS_PARENT_PORTAL\s*=|student-modal-overlay|function ensureDedicatedButton|sa-hamburger|function EDUTRACK_SUBSCRIBE_REGISTER_PART2|window\.EDUTRACK_ENHANCEMENT_PART1\s*=/.test(source)
          ? '<script data-edutrack-script-index="'+index+'"'+attributes+'>'+source+'</script>' : tag);
      const attendanceUi = Buffer.from(`<script>
        (function(){'use strict';var activated=false;function activate(){if(activated)return;activated=true;document.querySelectorAll('script[data-edutrack-lazy="true"]').forEach(function(node){var script=document.createElement('script');Array.prototype.forEach.call(node.attributes,function(attribute){if(attribute.name!=='type'&&attribute.name!=='data-edutrack-lazy')script.setAttribute(attribute.name,attribute.value)});script.text=node.textContent;node.parentNode.replaceChild(script,node)});window.dispatchEvent(new CustomEvent('edutrack:legacy-modules-activated'))}document.addEventListener('click',function(event){var target=event.target&&event.target.closest&&event.target.closest('.login-level-btn:not([data-level="SCHOOL"]):not([data-level="DISTRICT"]):not([data-level="REGIONAL"]):not([data-level="NATIONAL"]):not([data-level="PARENT"]):not([data-level="STUDENT"])');if(target)activate()},true);window.EDUTRACK_BOOT={activateLegacyModules:activate};})();
      </script><script src="admin-dashboard-separation.js" defer></script><script src="startup-readiness.js" defer></script><script src="school-module-loader.js" defer></script><script src="school-login-boot.js" defer></script><script src="attendance-register-ui.js" defer></script>`);
return Buffer.concat([Buffer.from(shell, 'latin1'), attendanceUi]);
}
module.exports={PUBLIC_FILES,renderLoginShell};
