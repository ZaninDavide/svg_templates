ssh -t andrea@raspberrypi.baida.dev \
    '
        if sudo systemctl is-active svg_templates.service; then \
            # Stop the server
            sudo systemctl stop svg_templates.service && echo "Server stopped"; \
        else \
            # Registering server for the first time
            sudo systemctl enable /home/andrea/apis/svg_templates/server/svg_templates.service && echo "Registering server for the first time"; \
        fi

        # Retrive changes from git
        cd ~/apis/svg_templates;
        git pull;

        # Run the server
        sudo systemctl start svg_templates.service;
    '