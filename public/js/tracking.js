document.getElementById('buscar-btn').addEventListener('click', () => {
    const codigo = document.getElementById('codigo-estado').value.trim();

    if (!codigo) {
        alert('Por favor ingresa un código de seguimiento');
        return;
    }

    fetch(`/api/buscar-guia?codigo=${codigo}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                document.getElementById('tracking-info').style.display = 'none';
            } else {
                // Nombres exactos que envía la API
                document.getElementById('guide-number').textContent = data.numero_guia;
                document.getElementById('guide-fecha').textContent = data.fecha_generacion;
                document.getElementById('guide-codigo-seguimiento').textContent = data.codigo_seguimiento;
                document.getElementById('guide-contenido').textContent = data.contenido;
                document.getElementById('guide-valor').textContent = data.valor;
                document.getElementById('guide-peso').textContent = data.peso;
                document.getElementById('guide-dimensiones').textContent = data.dimensiones;
                document.getElementById('guide-estado').textContent = data.estado;
                document.getElementById('guide-fecha-creacion').textContent = data.fecha_creacion;
                document.getElementById('guide-remitente').textContent = data.id_remitente;
                document.getElementById('guide-destinatario').textContent = data.id_destinatario;

                document.getElementById('tracking-info').style.display = 'block';
            }
        })
        .catch(err => {
            console.error(err);
            alert('Error al consultar la guía');
        });
});
