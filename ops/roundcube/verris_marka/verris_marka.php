<?php

/**
 * Verris Poczta — marka webmaila (logo i kolory Verris) bez kopii skórki Elastic.
 *
 * Plugin tylko dołącza arkusz stylów; logo ustawia `skin_logo` w konfiguracji (profil węzła).
 * API pluginów Roundcube: https://github.com/roundcube/roundcubemail/wiki/Plugin-API
 */
class verris_marka extends rcube_plugin
{
    public function init()
    {
        $this->include_stylesheet('verris.css');
    }
}
